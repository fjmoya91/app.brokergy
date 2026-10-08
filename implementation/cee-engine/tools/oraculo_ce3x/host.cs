using System;
using System.IO;
using System.Runtime.InteropServices;
class Host {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool SetDllDirectory(string p);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibrary(string p);
  [DllImport("python27.dll", CallingConvention=CallingConvention.Cdecl)] static extern void Py_Initialize();
  [DllImport("python27.dll", CallingConvention=CallingConvention.Cdecl)] static extern int PyRun_SimpleString(string code);
  static int Main(string[] args) {
    string ce = Environment.GetEnvironmentVariable("CE3X_DIR") ?? @"C:\Program Files (x86)\CE3Xv3.2";
    Environment.SetEnvironmentVariable("PYTHONHOME", ce);
    Environment.SetEnvironmentVariable("PYTHONPATH", ce);
    Environment.SetEnvironmentVariable("PYTHONDONTWRITEBYTECODE", "1");
    Environment.SetEnvironmentVariable("PATH", ce + ";" + Environment.GetEnvironmentVariable("PATH"));
    SetDllDirectory(ce);
    Directory.SetCurrentDirectory(ce);
    if (LoadLibrary(Path.Combine(ce, "python27.dll")) == IntPtr.Zero) { Console.WriteLine("LoadLibrary fallo " + Marshal.GetLastWin32Error()); return 1; }
    Py_Initialize();
    string p = args[0].Replace("\\", "\\\\");
    return PyRun_SimpleString("execfile('" + p + "')");
  }
}
