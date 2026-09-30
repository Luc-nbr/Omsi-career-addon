import filmWebm from "./assets/wakker.webm";
import filmMp4 from "./assets/wakker.mp4";

/*
 * Het scherm van de telefoon of tablet aan houden, en volledig scherm.
 *
 * WAAROM ZO OMSLACHTIG
 * De nette manier is de Wake Lock van de browser, maar die mag alleen op een
 * "veilige" pagina (https of localhost). Deze pagina komt over gewoon http van
 * de pc in het eigen netwerk, dus op een telefoon is ze dat niet: de browser
 * geeft `navigator.wakeLock` dan niet eens. Wat wel werkt, ook over http: een
 * stil filmpje dat in een lus speelt. Zolang er een video speelt, laat Android
 * het scherm aan, en Safari ook. Het filmpje (webm voor Android, mp4 voor
 * Safari) komt uit NoSleep.js van Rich Tibbett (MIT).
 *
 * Een browser laat een video pas spelen na een tik van de gebruiker. Lukt het
 * bij het openen niet, dan probeert de eerste tik het opnieuw -- en die tik is
 * er altijd, want je moet je aanmelden.
 *
 * Volledig scherm: op Android haalt dat de adresbalk weg die een snelkoppeling
 * op het beginscherm over http houdt (een echte webapp installeren mag daar
 * alleen via https). Ook dat mag alleen na een tik; zie `useVolScherm`.
 */

let slot: { release(): Promise<void> } | undefined;
let film: HTMLVideoElement | undefined;

function maakFilm(): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("aria-hidden", "true");
  // Wel in de pagina, anders pauzeert een zuinige browser hem; maar niet te zien.
  video.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  for (const [bron, soort] of [
    [filmWebm, "video/webm"],
    [filmMp4, "video/mp4"],
  ] as const) {
    const source = document.createElement("source");
    source.src = bron;
    source.type = soort;
    video.appendChild(source);
  }
  document.body.appendChild(video);
  return video;
}

async function vraagSlot(): Promise<boolean> {
  const wl = (navigator as Navigator & {
    wakeLock?: { request(soort: "screen"): Promise<{ release(): Promise<void> }> };
  }).wakeLock;
  if (!wl || !window.isSecureContext) return false;
  try {
    slot = await wl.request("screen");
    return true;
  } catch {
    // Geweigerd, bijvoorbeeld bij batterijbesparing: dan het filmpje.
    return false;
  }
}

async function houdAan(): Promise<void> {
  if (document.visibilityState !== "visible") return;
  if (await vraagSlot()) return;
  film ??= maakFilm();
  if (film.paused) await film.play().catch(() => undefined);
}

/**
 * Houdt het scherm aan zolang de pagina open en zichtbaar is. Na wegklikken
 * en terugkomen laat de browser het slot of het filmpje los; dan opnieuw.
 */
export function houdSchermAan(): () => void {
  const opnieuw = (): void => void houdAan();
  void houdAan();
  document.addEventListener("visibilitychange", opnieuw);
  /*
   * Elke tik mag het opnieuw proberen: het kost niets als het al loopt. Het
   * loslaten en niet het neerzetten, want op een touchscreen telt pas het
   * loslaten als tik waarna een video mag spelen.
   */
  document.addEventListener("pointerup", opnieuw, { passive: true });
  document.addEventListener("click", opnieuw, { passive: true });
  return () => {
    document.removeEventListener("visibilitychange", opnieuw);
    document.removeEventListener("pointerup", opnieuw);
    document.removeEventListener("click", opnieuw);
    void slot?.release().catch(() => undefined);
    slot = undefined;
    film?.pause();
  };
}

type VolDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
};
type VolElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Kan deze browser volledig scherm? Een iPhone kan het niet (een iPad wel). */
export function volSchermKan(): boolean {
  const d = document as VolDocument;
  // Al als app op het beginscherm geopend: er is geen balk weg te halen.
  const alsApp = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
  return !alsApp && Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isVolScherm(): boolean {
  const d = document as VolDocument;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

export async function volScherm(): Promise<void> {
  const el = document.documentElement as VolElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else el.webkitRequestFullscreen?.();
  } catch {
    // Geweigerd (geen tik, of de browser wil niet): dan blijft de knop staan.
  }
}
