/*
 * El arnés del oráculo de CE3X en C (el de Windows, cee-engine/tools/oraculo_ce3x/host.cs, es
 * de C# y bajo Wine pediría Mono). Carga el python27.dll de CE3X y ejecuta execfile(argv[1]).
 *
 * Se llama `ce3xpy.exe`, como el del PC. El motor de CE3X solo abre un .cex con CE3X 3.2 ABIERTO
 * (`TASKLIST /FI "imagename eq ce3xv3.2.exe"`, Calculos/vg2.pyd → vg3.getVG3 → abreArchivoCEX):
 * lo abre servidor.js (`abrirCe3x`), oculto en la pantalla virtual, como cexAPdf.js en el PC.
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>

typedef void (__cdecl *f_init)(void);
typedef int (__cdecl *f_run)(const char *);

int main(int argc, char **argv) {
    char ce[1024], dll[1200], ruta[8192], codigo[4096], esc[2048];
    const char *e = getenv("CE3X_DIR");
    int j = 0;
    if (argc < 2) { fprintf(stderr, "uso: ce3xpy.exe script.py\n"); return 2; }
    lstrcpynA(ce, e ? e : "C:\\Program Files (x86)\\CE3Xv3.2", sizeof ce);
    SetEnvironmentVariableA("PYTHONHOME", ce);
    SetEnvironmentVariableA("PYTHONPATH", ce);
    SetEnvironmentVariableA("PYTHONDONTWRITEBYTECODE", "1");
    snprintf(ruta, sizeof ruta, "%s;%s", ce, getenv("PATH") ? getenv("PATH") : "");
    SetEnvironmentVariableA("PATH", ruta);
    SetDllDirectoryA(ce);
    SetCurrentDirectoryA(ce);
    snprintf(dll, sizeof dll, "%s\\python27.dll", ce);
    HMODULE h = LoadLibraryA(dll);
    if (!h) { fprintf(stderr, "LoadLibrary(%s) fallo %lu\n", dll, GetLastError()); return 1; }
    f_init ini = (f_init)GetProcAddress(h, "Py_Initialize");
    f_run run = (f_run)GetProcAddress(h, "PyRun_SimpleString");
    if (!ini || !run) { fprintf(stderr, "python27.dll sin Py_Initialize/PyRun_SimpleString\n"); return 1; }
    ini();
    for (const char *p = argv[1]; *p && j < (int)sizeof esc - 4; p++) {
        if (*p == '\\' || *p == '\'') esc[j++] = '\\';
        esc[j++] = *p;
    }
    esc[j] = 0;
    snprintf(codigo, sizeof codigo, "execfile('%s')", esc);
    return run(codigo);
}
