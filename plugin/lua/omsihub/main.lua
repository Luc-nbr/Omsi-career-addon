-- OMSIHUB v1 -- de Lua-plugin van Omsi-Hub voor openOMSI. Omsi-Hub zet hem hier neer en werkt hem bij.
--
-- Wat dit is
--   De brug tussen openOMSI en Omsi-Hub, gebouwd op de proefplugin omsihubproef die
--   op 30-09-2026 in openOMSI 0.1.238 werkte (info, position, vars, str, save en het
--   opdrachtkanaal via package.path). Hij staat in "OMSI 2\plugins\omsihub\main.lua"
--   (openOMSI zoekt plugins/<naam>/main.lua in elke inhoudsbron; lua.rs:30-46,
--   plugins.rs:9-25) en doet dit:
--   1. elke 0,25 s speltijd (met bus) omsi.data vullen en met omsi.save() wegschrijven
--      naar data.save.lua in deze map (lua.rs:72): de dienst, de volgende halte, de
--      vertraging, de snelheid, de plek, de tank, de deuren, de reizigers, de
--      IBIS-teksten en de getallen en teksten waar de app om vroeg. Zonder bus eens
--      per seconde, als hartslag;
--   2. elke 0,1 s de snelheid volgen voor de rijstijl (hard remmen en optrekken) en
--      coll_energy voor aanrijdingen, met dezelfde grenzen als de DLL voor OMSI 2
--      (plugin/omsicareer.c);
--   3. elke 0,2 s opdracht.save.lua lezen (knoppen) en elke 2 s lijsten.save.lua (welke
--      getallen en teksten de app wil), via package.path en require: een .save.lua
--      laat de plugin niet herladen (lua.rs:106).
--
-- Veiligheid
--   - Alles loopt in pcall: een fout wordt een logregel en telt niet mee voor de 10
--     fouten waarna openOMSI een plugin uitzet (lua.rs:311-335).
--   - Niets per beeld: alleen timers van omsi.every/omsi.after (prelude.lua:28-39).
--   - Geen io, geen os.execute, geen bestanden buiten deze map.
--   - Knoppen alleen met een naam van letters, cijfers en '_', en nooit een motoractie
--     (kaartje, wisselgeld, knipperlicht, handrem, koplampen): die handelt openOMSI zelf
--     af (player.rs:460-510).

local MERK = "omsihub v1"
local VERSIE = 1

-- De namen uit plugin/OMSICareer.opl van Omsi-Hub (de app maakt er de bits van `seen`,
-- `seenSys` en `seenStr` van, zoals bij OMSI 2).
local VARS = { "Velocity", "humans_count", "schedule_active", "target_index_int",
  "tank_percent", "kmcounter_km", "kmcounter_m", "PAX_Entry0_Req", "PAX_Exit0_Req",
  "GivenTicket", "PAX_Entry0_Open", "PAX_Exit0_Open", "AI_Scheduled_AtStation",
  "Envir_Brightness", "StreetCond", "Velocity_Ground", "lights_abbl", "lights_blinker_l",
  "lights_blinker_r", "lights_brems", "engine_on", "IBIS_busstop_index", "electric_battery" }
local STRS = { "IBIS_busstop_name", "IBIS_Delay_min", "IBIS_Delay_sec", "SetLineTo",
  "IBIS_cabindisplay", "Matrix_Nr", "IBIS_terminus_name", "IBIS_Complex_Line",
  "LAWO_display_line1", "LAWO_display_line2", "LAWO_display_line3", "LAWO_display_line4",
  "afr_display_1", "afr_display_2" }
local SYS = { "Time", "Day", "Month", "Year", "PrecipRate", "PrecipType", "coll_energy",
  "Weather_Temperature" }

-- Wat openOMSI zelf afhandelt; via veh.trigger zou het niets of het verkeerde doen.
local MOTORACTIE = { ticket_give = true, change_give = true, change_take = true,
  blinker_left_set = true, blinker_right_set = true, blinker_off = true,
  blinker_warn_toggle = true, parking_brake_toggle = true, kw_scheinwerfer_toggle = true }

local SCHRIJF_ELKE = 0.25  -- s speltijd, met bus (plan 3.3)
local HARTSLAG_ELKE = 1.0  -- s, zonder bus
local RIJSTIJL_ELKE = 0.1  -- s
local OPDRACHT_ELKE = 0.2  -- s (plan 3.4)
local LIJSTEN_ELKE = 2.0   -- s
local LOS_NA = 0.1         -- s tussen press en release (plan 3.5)
local TUSSEN_KNOPPEN = 0.15
local RUST_NA_FOUT = 5     -- s niet schrijven na een schrijffout (plan 3.3)
local MAX_VRAGEN, MAX_GETALLEN = 160, 512
local VERS_S = 5           -- een knop ouder dan dit (os.time) wordt niet meer ingedrukt

-- Rijstijl, gelijk aan plugin/omsicareer.c.
local HARSH_BRAKE, HARSH_ACCEL, RELEASE_RATIO = 3.5, 2.2, 0.6
local MIN_EVENT_S, MIN_SPEED_KMH, SMOOTH, COLLISION_ENERGY = 0.35, 5.0, 0.25, 10.0

local fmt, concat, sort = string.format, table.concat, table.sort

-- ---------------------------------------------------------------------------------
-- Hulpjes
-- ---------------------------------------------------------------------------------

local logRegels = 0
local function log(f, ...)
  if logRegels >= 500 then return end
  logRegels = logRegels + 1
  local ok, s = pcall(fmt, f, ...)
  if not ok then s = tostring(f) end
  pcall(omsi.log, s)
end

-- JSON: stuurtekens als \u00XX, NaN en +-oneindig worden null.
local function json(v, diepte)
  diepte = diepte or 0
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" then return v and "true" or "false" end
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    if math.type(v) == "integer" then return fmt("%d", v) end
    return fmt("%.10g", v)
  end
  if t == "string" then
    return '"' .. (v:gsub('[%c"\\]', function(c)
      if c == '"' then return '\\"' end
      if c == "\\" then return "\\\\" end
      return fmt("\\u%04x", c:byte())
    end)) .. '"'
  end
  if t ~= "table" or diepte > 8 then return "null" end
  local delen = {}
  if v[1] ~= nil then
    for i = 1, #v do delen[i] = json(v[i], diepte + 1) end
    return "[" .. concat(delen, ",") .. "]"
  end
  local sleutels = {}
  for k in pairs(v) do if type(k) == "string" then sleutels[#sleutels + 1] = k end end
  sort(sleutels)
  for _, k in ipairs(sleutels) do delen[#delen + 1] = json(k) .. ":" .. json(v[k], diepte + 1) end
  return "{" .. concat(delen, ",") .. "}"
end

local function klokMs() return os.clock() * 1000 end

local function leesInfo()
  local ok, t = pcall(omsi.info)
  if ok and type(t) == "table" then return t end
  return {}
end

local function leesPlek()
  local ok, x, y, z, h = pcall(omsi.position)
  if ok and type(x) == "number" then return { x = x, y = y, z = z, koers = h } end
  return nil
end

local function heeftBus()
  local ok, b = pcall(omsi.has_vehicle)
  return ok and b == true
end

-- Leest elke naam met f (omsi.var, omsi.str of omsi.sys): de gevonden waarden en de
-- namen die nil gaven.
local function leesLijst(lijst, f)
  local uit, ontbreekt = {}, {}
  for _, n in ipairs(lijst) do
    local ok, w = pcall(f, n)
    if ok and w ~= nil then uit[n] = w else ontbreekt[#ontbreekt + 1] = n end
  end
  return uit, ontbreekt
end

local function knopMag(k)
  return type(k) == "string" and #k <= 64 and k:match("^[%w_]+$") ~= nil and not MOTORACTIE[k:lower()]
end

-- ---------------------------------------------------------------------------------
-- Toestand. `staat` gaat mee in omsi.data.staat en overleeft dus herladen (openOMSI
-- bewaart omsi.data bij stop, lua.rs:371, en laadt het bij de volgende start,
-- prelude.lua:167-175). De rest hoort bij deze Lua-staat alleen.
-- ---------------------------------------------------------------------------------

local staat
local fouten, foutTelling = 0, {}
local rustTot, schrijfFouten = -1, 0
local schrijfMeting = { n = 0, som = 0 }
local laatsteSchrijfMs
local vragen, getallen = {}, {}
local laatsteKnopSeq
local getalAantal = 0
local vorigeSnel, vorigeTijd, versnelling = nil, nil, 0
local remVast, optrekVast, remGeteld, optrekGeteld, klapVast = 0, 0, false, false, false
local tellerHartslag = 0

local function nieuweSessie()
  return fmt("%d-%d", os.time(), math.floor(klokMs()))
end

local function nieuweRijstijl()
  return { maxBrake = 0, maxAccel = 0, topSpeed = 0, harshBrakes = 0, harshAccels = 0,
    collisions = 0, collisionEnergy = 0, worstCollision = 0 }
end

local function zorgStaat()
  if type(staat) ~= "table" then
    staat = { sessie = nieuweSessie(), herladen = 0, einde = false, gemeld = false }
  end
  if type(staat.sessie) ~= "string" then staat.sessie = nieuweSessie() end
  staat.herladen = tonumber(staat.herladen) or 0
  if type(staat.rijstijl) ~= "table" then staat.rijstijl = nieuweRijstijl() end
  for k, v in pairs(nieuweRijstijl()) do
    if type(staat.rijstijl[k]) ~= "number" then staat.rijstijl[k] = v end
  end
  if type(omsi.data) ~= "table" then omsi.data = {} end
  return staat
end

local function veilig(naam, fn)
  return function(...)
    local ok, fout = pcall(fn, ...)
    if not ok then
      fouten = fouten + 1
      local n = (foutTelling[naam] or 0) + 1
      foutTelling[naam] = n
      if n <= 3 or n % 100 == 0 then log("fout in %s (%d keer): %s", naam, n, tostring(fout)) end
    end
  end
end

local KAN = {}
local function bepaalKan()
  for _, n in ipairs({ "info", "position", "vars", "press", "release", "var", "str", "sys",
      "vehicle", "has_vehicle", "save", "every", "after", "on" }) do
    KAN[n] = type(omsi[n]) == "function"
  end
end

-- ---------------------------------------------------------------------------------
-- Start, voertuig en stop (plan 3.2)
-- ---------------------------------------------------------------------------------

local function bijStart()
  local i = leesInfo()
  -- Echte start: openOMSI laadt plugins zonder bus, dan is info() leeg. Herladen
  -- gebeurt midden in een beeld met echte gegevens (lua.rs:337-352).
  local echt = next(i) == nil
  local geladen = omsi.data
  local vorig = type(geladen) == "table" and type(geladen.staat) == "table" and geladen.staat or nil
  if echt or not (vorig and type(vorig.sessie) == "string") then
    staat = nil
    omsi.data = {}
  else
    staat = vorig
    staat.herladen = (tonumber(staat.herladen) or 0) + 1
    staat.einde = false
  end
  zorgStaat()
  omsi.data.merk = MERK
  omsi.data.staat = staat
  log("%s %s sessie=%s herladen=%d", MERK, echt and "start" or "herladen", staat.sessie, staat.herladen)
end

local function telGetallen()
  local ok, lijst = pcall(omsi.vars)
  getalAantal = (ok and type(lijst) == "table") and #lijst or 0
end

local function bijVoertuig(naam)
  zorgStaat()
  if naam == nil then return end
  vorigeSnel, vorigeTijd, versnelling = nil, nil, 0
  if not staat.gemeld then
    staat.gemeld = true
    pcall(omsi.message, "Omsi-Hub gekoppeld", 3)
  end
  omsi.after(2, veilig("telGetallen", telGetallen))
end

-- ---------------------------------------------------------------------------------
-- Rijstijl en aanrijdingen (plugin/omsicareer.c, track_motion en track_collision)
-- ---------------------------------------------------------------------------------

local function rijstijl()
  if not heeftBus() then vorigeSnel = nil; return end
  zorgStaat()
  local r = staat.rijstijl
  local nu = omsi.time()
  local okV, kmh = pcall(omsi.var, "Velocity")
  if okV and type(kmh) == "number" and kmh == kmh then
    if math.abs(kmh) > r.topSpeed then r.topSpeed = math.abs(kmh) end
    local snel = kmh / 3.6
    if vorigeSnel and vorigeTijd and nu > vorigeTijd then
      local stap = nu - vorigeTijd
      local ruw = (snel - vorigeSnel) / stap
      if stap <= 0.5 and ruw <= 12 and ruw >= -12 then
        versnelling = versnelling * (1 - SMOOTH) + ruw * SMOOTH
        if math.abs(kmh) < MIN_SPEED_KMH then
          remVast, optrekVast, remGeteld, optrekGeteld = 0, 0, false, false
        else
          local rem = versnelling < 0 and -versnelling or 0
          local op = versnelling > 0 and versnelling or 0
          if rem > r.maxBrake then r.maxBrake = rem end
          if op > r.maxAccel then r.maxAccel = op end
          if rem >= HARSH_BRAKE then
            remVast = remVast + stap
            if not remGeteld and remVast >= MIN_EVENT_S then r.harshBrakes = r.harshBrakes + 1; remGeteld = true end
          elseif rem < HARSH_BRAKE * RELEASE_RATIO then
            remVast, remGeteld = 0, false
          end
          if op >= HARSH_ACCEL then
            optrekVast = optrekVast + stap
            if not optrekGeteld and optrekVast >= MIN_EVENT_S then r.harshAccels = r.harshAccels + 1; optrekGeteld = true end
          elseif op < HARSH_ACCEL * RELEASE_RATIO then
            optrekVast, optrekGeteld = 0, false
          end
        end
      end
    end
    vorigeSnel, vorigeTijd = snel, nu
  end
  local okE, klap = pcall(omsi.sys, "coll_energy")
  if okE and type(klap) == "number" and klap == klap then
    if klap < 0 then klap = 0 end
    r.collisionEnergy = r.collisionEnergy + klap
    if klap > r.worstCollision then r.worstCollision = klap end
    if klap >= COLLISION_ENERGY then
      if not klapVast then r.collisions = r.collisions + 1; klapVast = true end
    elseif klap <= 0 then
      klapVast = false
    end
  end
end

-- ---------------------------------------------------------------------------------
-- Uitgaand: omsi.data vullen en bewaren (plan 3.3)
-- ---------------------------------------------------------------------------------

local function momentopname(einde)
  local i = leesInfo()
  local bus = heeftBus()
  local uit = {
    v = VERSIE, merk = MERK,
    spel = {
      motor = "openomsi", busGeladen = bus, sessie = staat.sessie, herladen = staat.herladen,
      einde = einde and true or false, opFoot = i.on_foot, kaartNaam = i.map, pauze = i.paused,
      beeld = i.view, schrijfMs = laatsteSchrijfMs, kan = KAN, fouten = fouten,
    },
    dienst = {
      lijn = i.line, omloop = i.tour, rit = i.trip, ritten = i.trips, eindpunt = i.terminus,
      volgende = i.next_stop, aankomst = i.next_stop_arrival, vertrek = i.next_stop_departure,
      vertragingS = i.delay,
    },
    klok = i.clock, dagVanJaar = i.day, jaar = i.year, snelheid = i.speed,
    rijstijl = staat.rijstijl, opdrachtSeq = laatsteKnopSeq, getalAantal = getalAantal,
  }
  if bus then
    local okV, voertuig = pcall(omsi.vehicle)
    uit.spel.voertuig = okV and voertuig or nil
    uit.plek = leesPlek()
    uit.vars = leesLijst(VARS, omsi.var)
    uit.strs = leesLijst(STRS, omsi.str)
    uit.sys = leesLijst(SYS, omsi.sys)
    if #vragen > 0 then uit.vragen = leesLijst(vragen, omsi.str) end
    if #getallen > 0 then
      local g, onbekend = leesLijst(getallen, omsi.var)
      uit.getallen, uit.onbekend = g, onbekend
    end
  end
  return uit
end

local function bewaar(einde)
  zorgStaat()
  local tekst = json(momentopname(einde))
  omsi.data.merk = MERK
  omsi.data.json = tekst
  omsi.data.staat = staat
  local nu = omsi.time()
  if nu < rustTot then return end
  local t0 = klokMs()
  local ok, fout = pcall(omsi.save)
  local ms = klokMs() - t0
  if ok then
    laatsteSchrijfMs = ms
    schrijfMeting.n = schrijfMeting.n + 1
    schrijfMeting.som = schrijfMeting.som + ms
  else
    schrijfFouten = schrijfFouten + 1
    rustTot = nu + RUST_NA_FOUT
    if schrijfFouten <= 3 then log("schrijffout (%d) %s", schrijfFouten, tostring(fout)) end
  end
end

local overslaan = 0
local function schrijf()
  if heeftBus() then
    -- Kost het schrijven gemiddeld meer dan 2 ms, dan om de beurt (plan 3.3).
    if schrijfMeting.n > 20 and schrijfMeting.som / schrijfMeting.n > 2 then
      overslaan = (overslaan + 1) % 2
      if overslaan == 1 then return end
    end
    bewaar(false)
  else
    tellerHartslag = tellerHartslag + SCHRIJF_ELKE
    if tellerHartslag + 1e-6 < HARTSLAG_ELKE then return end
    tellerHartslag = 0
    bewaar(false)
  end
end

local function bijStop()
  zorgStaat()
  local echt = next(leesInfo()) == nil
  staat.einde = echt
  local ok, snap = pcall(momentopname, echt)
  if ok then omsi.data.json = json(snap) end
  omsi.data.merk = MERK
  omsi.data.staat = staat
  -- Geen omsi.save() hier: openOMSI schrijft omsi.data zelf na stop (lua.rs:366-372).
end

-- ---------------------------------------------------------------------------------
-- Inkomend: knoppen en lijsten (plan 3.4 en 3.5)
-- ---------------------------------------------------------------------------------

local function laad(naam)
  package.loaded[naam] = nil
  local ok, o = pcall(require, naam)
  package.loaded[naam] = nil
  if ok and type(o) == "table" then return o end
  return nil
end

local function druk(naam, wijze, wacht)
  omsi.after(wacht, veilig("knop", function()
    if wijze ~= "los" then omsi.press(naam) end           -- veh.trigger(naam)
    if wijze == "druk" then
      omsi.after(LOS_NA, veilig("los", function() omsi.release(naam) end)) -- naam.."_off"
    elseif wijze == "los" then
      omsi.release(naam)
    end
  end))
end

local function leesOpdracht()
  local o = laad("opdracht")
  if not o or type(o.knoppen) ~= "table" then return end
  local nu = os.time()
  local hoogste = laatsteKnopSeq
  local n = 0
  for _, k in ipairs(o.knoppen) do
    local seq, naam, t = tonumber(k.s), k.n, tonumber(k.t)
    if seq and (laatsteKnopSeq == nil or seq > laatsteKnopSeq) then
      if t and math.abs(nu - t) <= VERS_S and knopMag(naam) and heeftBus() then
        local wijze = (k.w == "vast" or k.w == "los") and k.w or "druk"
        druk(naam, wijze, n * TUSSEN_KNOPPEN)
        n = n + 1
      end
      if hoogste == nil or seq > hoogste then hoogste = seq end
    end
  end
  laatsteKnopSeq = hoogste
end

local function namen(lijst, max)
  local uit = {}
  if type(lijst) ~= "table" then return uit end
  for _, n in ipairs(lijst) do
    if type(n) == "string" and #n > 0 and #n <= 128 then uit[#uit + 1] = n end
    if #uit >= max then break end
  end
  return uit
end

local function leesLijsten()
  local o = laad("lijsten")
  if not o then return end
  vragen = namen(o.vragen, MAX_VRAGEN)
  getallen = namen(o.getallen, MAX_GETALLEN)
end

-- ---------------------------------------------------------------------------------
-- Bovenste niveau: loopt bij elke (her)start, voor het start-event (lua.rs:126-133).
-- ---------------------------------------------------------------------------------

local function opbouw()
  bepaalKan()
  -- Het opdrachtkanaal: openOMSI zet package.path op "<map>/?.lua;<map>/?/init.lua"
  -- (lua.rs:156-159). Voortaan alleen "<map>/?.save.lua": require("opdracht") vindt dan
  -- opdracht.save.lua, en een .save.lua laat de plugin niet herladen (lua.rs:106).
  local oud = type(package) == "table" and package.path or nil
  local map = type(oud) == "string" and oud:match("^(.-)/%?%.lua") or nil
  if map then package.path = map .. "/?.save.lua" end

  omsi.on("start", veilig("start", bijStart))
  omsi.on("vehicle", veilig("vehicle", bijVoertuig))
  omsi.on("stop", veilig("stop", bijStop))
  omsi.every(SCHRIJF_ELKE, veilig("schrijf", schrijf))
  omsi.every(RIJSTIJL_ELKE, veilig("rijstijl", rijstijl))
  omsi.every(OPDRACHT_ELKE, veilig("opdracht", leesOpdracht))
  omsi.every(LIJSTEN_ELKE, veilig("lijsten", leesLijsten))
  pcall(leesLijsten)
end

local ok, fout = pcall(opbouw)
if not ok then pcall(omsi.log, "omsihub: opbouw mislukt " .. tostring(fout)) end
