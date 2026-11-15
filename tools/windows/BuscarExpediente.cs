// BuscarExpediente.cs — ventanita para abrir en el Explorador la carpeta LOCAL de un expediente.
// Escribes «26RES060_130», «26.060/130», «060/130», «130», «26.080/OP47» o un trozo del nombre del
// cliente («ismael grande»), Enter, y abre la carpeta. Si casan varias, las lista (doble clic o Enter).
// Busca en vivo, sin índice que se quede viejo: en el espejo de Drive (01. BROKERGY-APP EXPEDIENTES)
// mira cada carpeta de estado y, dentro, las de LOTE-…/PAQUETE… (~660 carpetas, < 2 s).
// Es un .exe y no un .ps1 porque en este PC powershell.exe tarda 10 s solo en arrancar (medido el
// 03/11/2026). Lo compila e instala instalar-buscar-expediente.cmd (csc de .NET Framework, C# 5).
// «BuscarExpediente.exe 26.060/130» busca nada más abrir. Probar sin ventana: compilar con
// /target:exe y lanzar «BuscarExpediente.exe /print 26.060/130».
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

static class BuscarExpediente
{
    static string Raiz;
    static readonly Regex RxCodigo = new Regex(@"^(\d{2,4})([A-Z]{3,4})(\d{3})_([A-Z0-9]+)$");   // 26RES060_130, 26RES080_OP47
    static readonly Regex RxEntrada = new Regex(@"^(\d{2,4})\s*[A-Z]{3,4}\s*(\d{3})[\s_./-]*((OP)?\d+)$");
    static readonly Regex RxExpediente = new Regex(@"^\d{2,4}(RES|TER|CEE|RITE)", RegexOptions.IgnoreCase);

    class Filtro { public string Anio, Tipo, Num, Texto; }

    static string Normalizar(string s)
    {
        return Regex.Replace(s.ToUpperInvariant().Normalize(NormalizationForm.FormD), @"\p{Mn}", "");
    }

    static string[] Subcarpetas(string ruta)
    {
        try { return Directory.GetDirectories(ruta); } catch { return new string[0]; }
    }

    // Las carpetas candidatas: <estado>\<exp> y <estado>\<LOTE…>\<exp>.
    static IEnumerable<string> Carpetas()
    {
        foreach (var estado in Subcarpetas(Raiz))
            foreach (var c in Subcarpetas(estado))
            {
                if (RxExpediente.IsMatch(Path.GetFileName(c))) yield return c;
                else foreach (var d in Subcarpetas(c))
                    if (RxExpediente.IsMatch(Path.GetFileName(d))) yield return d;
            }
    }

    // Traduce lo escrito a un filtro: código (año/tipo/número, cada uno opcional) o texto del nombre.
    static Filtro GetFiltro(string texto)
    {
        var t = Normalizar(texto).Trim();
        var m = RxEntrada.Match(t);
        if (m.Success) return new Filtro { Anio = m.Groups[1].Value, Tipo = m.Groups[2].Value, Num = m.Groups[3].Value };
        var tok = Regex.Split(t, "[^A-Z0-9]+").Where(x => x.Length > 0).ToArray();
        bool todosNum = tok.All(x => Regex.IsMatch(x, @"^(OP)?\d+$"));
        bool tipoNum = tok.Length < 2 || Regex.IsMatch(tok[tok.Length - 2], @"^\d+$");   // el tipo solo puede ser 060/080/093…
        if (tok.Length >= 1 && tok.Length <= 3 && todosNum && tipoNum)
        {
            if (tok.Length == 3) return new Filtro { Anio = tok[0], Tipo = tok[1], Num = tok[2] };
            if (tok.Length == 2) return new Filtro { Tipo = tok[0], Num = tok[1] };
            return new Filtro { Num = tok[0] };
        }
        return new Filtro { Texto = t };
    }

    static string SinCeros(string x)
    {
        var m = Regex.Match(x, @"^(OP)?0*(\d+)$");
        return m.Success ? m.Groups[1].Value + m.Groups[2].Value : x;
    }

    static string Ultimos2(string a) { return a.Length > 2 ? a.Substring(a.Length - 2) : a; }

    static bool Casa(string nombre, Filtro f)
    {
        var n = Normalizar(nombre);
        if (f.Texto != null) return n.Contains(f.Texto);
        int guion = n.IndexOf(" - ", StringComparison.Ordinal);
        var m = RxCodigo.Match((guion >= 0 ? n.Substring(0, guion) : n).Trim());
        if (!m.Success) return false;
        if (f.Anio != null && Ultimos2(m.Groups[1].Value) != Ultimos2(f.Anio)) return false;
        if (f.Tipo != null && int.Parse(m.Groups[3].Value) != int.Parse(f.Tipo)) return false;
        return SinCeros(m.Groups[4].Value) == SinCeros(f.Num);
    }

    static List<string> Buscar(string q)
    {
        var f = GetFiltro(q);
        return Carpetas().Where(c => Casa(Path.GetFileName(c), f))
                         .OrderBy(c => Path.GetFileName(c), StringComparer.OrdinalIgnoreCase).ToList();
    }

    [STAThread]
    static int Main(string[] args)
    {
        var b = Environment.GetEnvironmentVariable("LOCAL_DRIVE_BASE");
        if (string.IsNullOrEmpty(b)) b = @"C:\Users\Usuario\Mi unidad";
        Raiz = Path.Combine(b, @"01. RD 36-2023 (CAES)\05. PRODUCCIÓN\01. BROKERGY-APP EXPEDIENTES");

        if (args.Length == 2 && args[0] == "/print")
        {
            Console.OutputEncoding = Encoding.UTF8;
            foreach (var c in Buscar(args[1])) Console.WriteLine(c);
            return 0;
        }

        Application.EnableVisualStyles();
        var form = new Form
        {
            Text = "Buscar expediente", StartPosition = FormStartPosition.CenterScreen, ClientSize = new Size(624, 104),
            // FixedSingle y no FixedDialog: con borde de diálogo la ventana va sin icono y la barra de
            // tareas pinta el genérico (visto el 03/11/2026).
            FormBorderStyle = FormBorderStyle.FixedSingle, MaximizeBox = false, MinimizeBox = false, TopMost = true,
            KeyPreview = true, Font = new Font("Segoe UI", 10),
        };
        // buscar-expediente.ico (carpeta con lupa, imageres.dll nº 205) va dos veces en el .exe: como
        // icono Win32 (/win32icon: barra de tareas, Explorador, acceso directo) y como recurso, de
        // donde lo coge la ventana con todos sus tamaños.
        var ico = typeof(BuscarExpediente).Assembly.GetManifestResourceStream("buscar-expediente.ico");
        if (ico != null) form.Icon = new Icon(ico);
        var lbl = new Label { Text = "Nº de expediente o cliente   (26RES060_130 · 26.060/130 · nombre)", Location = new Point(12, 10), AutoSize = true };
        var txt = new TextBox { Location = new Point(12, 34), Width = 500, Font = new Font("Segoe UI", 13) };
        var btn = new Button { Text = "Abrir", Location = new Point(522, 33), Size = new Size(90, 32) };
        var estado = new Label { Location = new Point(12, 76), Size = new Size(600, 22), ForeColor = Color.DimGray };
        var lista = new ListBox { Location = new Point(12, 102), Width = 600, Visible = false, HorizontalScrollbar = true, IntegralHeight = false };
        form.Controls.AddRange(new Control[] { lbl, txt, btn, estado, lista });
        form.AcceptButton = btn;
        var rutas = new List<string>();

        Action<string> abrir = ruta =>
        {
            Process.Start("explorer.exe", "\"" + ruta + "\"");   // entrecomillada: explorer parte la ruta por las comas
            form.Close();
        };

        btn.Click += (s, e) =>
        {
            if (lista.Focused && lista.SelectedIndex >= 0) { abrir(rutas[lista.SelectedIndex]); return; }
            var q = txt.Text.Trim();
            if (q.Length == 0) return;
            if (!Directory.Exists(Raiz)) { estado.Text = "No encuentro la carpeta de expedientes: " + Raiz; return; }
            estado.Text = "Buscando…"; form.Refresh();
            rutas = Buscar(q);
            if (rutas.Count == 1) { abrir(rutas[0]); return; }
            lista.Items.Clear();
            if (rutas.Count == 0)
            {
                estado.Text = "No hay ninguna carpeta para «" + q + "».";
                lista.Visible = false; form.ClientSize = new Size(624, 104);
                txt.SelectAll(); txt.Focus();
                return;
            }
            foreach (var r in rutas) lista.Items.Add(r.Substring(Raiz.Length + 1));
            estado.Text = rutas.Count + " carpetas. Doble clic o Enter para abrir.";
            lista.Height = Math.Min(18, rutas.Count) * lista.ItemHeight + 6;
            lista.Visible = true; form.ClientSize = new Size(624, 114 + lista.Height);
            lista.SelectedIndex = 0; lista.Focus();
        };
        lista.DoubleClick += (s, e) => { if (lista.SelectedIndex >= 0) abrir(rutas[lista.SelectedIndex]); };
        form.KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) form.Close(); };
        form.Shown += (s, e) =>
        {
            form.Activate(); txt.Focus();
            if (args.Length == 1) { txt.Text = args[0]; btn.PerformClick(); }   // «BuscarExpediente.exe 26.060/130»
        };
        Application.Run(form);
        return 0;
    }
}
