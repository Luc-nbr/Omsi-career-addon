/*
 * NEPEXE: een programma met een willekeurige naam dat een Node-script draait.
 *
 * Voor de proeven van de spelmotor (scripts/probe-spelmotor.ts,
 * probe-openomsi-start.ts, probe-openomsi-app.cjs). Die hebben een
 * `openomsi.exe` en een `openomsi-launcher.exe` nodig die zich gedragen zoals
 * die van openOMSI -- met hun eigen opdrachtregel (`--cli launch <json>`,
 * `--no-menu --map x`) -- zonder dat er ooit een echt openOMSI start. Een kopie
 * van node.exe kan dat niet: Node weigert onbekende opties als `--cli`.
 *
 * Wat het doet: `<naam>.exe <rest>` start `node <naam>.cjs <rest>` (node uit
 * NEPEXE_NODE), met dezelfde stdin/stdout/stderr, wacht, en geeft de
 * afsluitcode door. Node zit in een job die sluit met dit programma: wie
 * NEPEXE afschiet (taskkill /F) schiet het script mee af. Wat het script zelf
 * start, valt buiten die job (SILENT_BREAKAWAY): een nep-launcher die een
 * nep-spel start, laat dat spel draaien zoals de echte launcher.
 *
 * Bouwen: scripts/nepexe/bouw.cmd (MSVC, 64-bits, zoals openOMSI).
 */
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

int wmain(void)
{
    wchar_t exe[MAX_PATH];
    wchar_t script[MAX_PATH];
    wchar_t node[MAX_PATH];
    if (!GetModuleFileNameW(NULL, exe, MAX_PATH)) return 90;
    wcscpy_s(script, MAX_PATH, exe);
    wchar_t *punt = wcsrchr(script, L'.');
    if (!punt) return 91;
    *punt = 0;
    if (wcscat_s(script, MAX_PATH, L".cjs")) return 92;
    if (!GetEnvironmentVariableW(L"NEPEXE_NODE", node, MAX_PATH)) return 93;

    /* De rest van de opdrachtregel, na de programmanaam, ongewijzigd. */
    wchar_t *regel = GetCommandLineW();
    wchar_t *p = regel;
    if (*p == L'"') {
        p++;
        while (*p && *p != L'"') p++;
        if (*p) p++;
    } else {
        while (*p && *p != L' ' && *p != L'\t') p++;
    }
    size_t lengte = wcslen(node) + wcslen(script) + wcslen(p) + 16;
    wchar_t *opdracht = (wchar_t *)HeapAlloc(GetProcessHeap(), 0, lengte * sizeof(wchar_t));
    if (!opdracht) return 94;
    swprintf_s(opdracht, lengte, L"\"%s\" \"%s\"%s", node, script, p);

    HANDLE job = CreateJobObjectW(NULL, NULL);
    if (job) {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION info;
        ZeroMemory(&info, sizeof info);
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
        SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info, sizeof info);
    }

    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof si);
    ZeroMemory(&pi, sizeof pi);
    si.cb = sizeof si;
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    si.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    si.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    if (!CreateProcessW(NULL, opdracht, NULL, NULL, TRUE, CREATE_SUSPENDED | CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) return 95;
    if (job) AssignProcessToJobObject(job, pi.hProcess);
    ResumeThread(pi.hThread);
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD code = 0;
    GetExitCodeProcess(pi.hProcess, &code);
    return (int)code;
}
