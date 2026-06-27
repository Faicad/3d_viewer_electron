param(
  [Parameter(Mandatory, Position = 0)]
  [string]$WindowTitle,

  [Parameter(Position = 1)]
  [string]$OutputPath = "",

  [Parameter(Position = 2)]
  [string]$FileName = ""
)

$scriptDir = Split-Path -Parent $PSCommandPath
$screenshotDir = Join-Path $scriptDir "screenshot"
if (-not (Test-Path $screenshotDir)) { New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null }

# Determine base filename (without _h/_v suffix)
if ($OutputPath) {
  $extless = [System.IO.Path]::GetFileNameWithoutExtension($OutputPath)
  $outDir = Split-Path $OutputPath -Parent
  if (-not $outDir) { $outDir = $screenshotDir }
  $base = Join-Path $outDir $extless
} elseif ($FileName) {
  $extless = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  $outDir = Split-Path $FileName -Parent
  if (-not $outDir) { $outDir = $screenshotDir }
  $base = Join-Path $outDir $extless
} else {
  $safeName = $WindowTitle -replace '[<>:"/\\|?*]', '_'
  $base = Join-Path $screenshotDir $safeName
}

# Auto-increment pairs (_h + _v)
$n = 1
$landscapePath = "${base}_h.png"
while (Test-Path $landscapePath) {
  $n++
  $landscapePath = "${base}_${n}_h.png"
}
$portraitPath = if ($n -eq 1) { "${base}_v.png" } else { "${base}_${n}_v.png" }

Add-Type -AssemblyName System.Drawing.Common
Add-Type -AssemblyName System.Windows.Forms

$code = @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;


public class WindowCapture {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("gdi32.dll")]
  public static extern bool BitBlt(IntPtr hdc, int x, int y, int w, int h, IntPtr hdcSrc, int xSrc, int ySrc, uint rop);

  [DllImport("user32.dll")]
  public static extern IntPtr GetDC(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

  [DllImport("user32.dll")]
  public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int nWidth, int nHeight, bool bRepaint);

  [DllImport("user32.dll")]
  public static extern bool SetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

  [DllImport("user32.dll")]
  public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

  [StructLayout(LayoutKind.Sequential)]
  public struct WINDOWPLACEMENT {
    public int length;
    public int flags;
    public int showCmd;
    public POINT ptMinPosition;
    public POINT ptMaxPosition;
    public RECT rcNormalPosition;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int x, y; }

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr GetClassName(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("kernel32.dll")]
  public static extern void Sleep(uint milliseconds);

  [DllImport("user32.dll")]
  public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

  [DllImport("user32.dll")]
  public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

  public struct RECT { public int Left, Top, Right, Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }

  const uint SRCCOPY = 0x00CC0020;
  const int SW_SHOWNORMAL = 1;
  const int SW_SHOWMINIMIZED = 2;
  const int SW_MAXIMIZE = 3;
  const int SW_RESTORE = 9;
  const uint MONITOR_DEFAULTTONEAREST = 2;
  const int GWL_STYLE = -16;
  const int WS_THICKFRAME = 0x00040000;
  const uint SWP_NOZORDER = 0x0004;
  const uint SWP_NOACTIVATE = 0x0010;
  const uint SWP_NOMOVE = 0x0002;
  const uint SWP_NOSIZE = 0x0001;
  const uint SWP_FRAMECHANGED = 0x0020;

  public static string FindTitle(string keyword) {
    string found = null;
    int count = 0;
    EnumWindows((hWnd, _) => {
      if (!IsWindowVisible(hWnd)) return true;
      int len = GetWindowTextLength(hWnd);
      if (len == 0) return true;
      var sb = new StringBuilder(len + 1);
      GetWindowText(hWnd, sb, sb.Capacity);
      if (sb.ToString().IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0) {
        count++;
        if (count == 1) found = sb.ToString();
        if (sb.ToString().Equals(keyword, StringComparison.OrdinalIgnoreCase))
          { found = sb.ToString(); return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr FindByTitle(string exact) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, _) => {
      if (!IsWindowVisible(hWnd)) return true;
      int len = GetWindowTextLength(hWnd);
      if (len == 0) return true;
      var sb = new StringBuilder(len + 1);
      GetWindowText(hWnd, sb, sb.Capacity);
      if (sb.ToString().Equals(exact, StringComparison.OrdinalIgnoreCase)) {
        found = hWnd;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr FindHandle(string keyword) {
    var title = FindTitle(keyword);
    if (title == null) {
      var noSpaceKeyword = keyword.Replace(" ", "").Replace("\t", "");
      EnumWindows((hWnd2, _) => {
        if (!IsWindowVisible(hWnd2)) return true;
        int len = GetWindowTextLength(hWnd2);
        if (len == 0) return true;
        var sb = new StringBuilder(len + 1);
        GetWindowText(hWnd2, sb, sb.Capacity);
        if (sb.ToString().Replace(" ", "").Replace("\t", "").IndexOf(noSpaceKeyword, StringComparison.OrdinalIgnoreCase) >= 0) {
          title = sb.ToString();
          return false;
        }
        return true;
      }, IntPtr.Zero);
    }

    if (title == null) {
      IntPtr found = IntPtr.Zero;
      EnumWindows((hWnd, _) => {
        if (!IsWindowVisible(hWnd)) return true;
        int len = GetWindowTextLength(hWnd);
        if (len == 0) return true;
        var sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        var cls = new StringBuilder(256);
        GetClassName(hWnd, cls, cls.Capacity);
        string clsName = cls.ToString();
        if (clsName == "Progman" || clsName == "WorkerW" || clsName == "Shell_TrayWnd" ||
            clsName == "Shell_SecondaryTrayWnd" || clsName == "Windows.UI.Core.CoreWindow") return true;
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        try {
          var proc = Process.GetProcessById((int)pid);
          if (proc.ProcessName.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0) {
            found = hWnd;
            title = sb.ToString();
            return false;
          }
        } catch { }
        return true;
      }, IntPtr.Zero);
      if (found != IntPtr.Zero) {
        Console.Error.WriteLine("MATCH:" + title + " (by process: " + keyword + ")");
        SetForegroundWindow(found);
        Sleep(300);
        return found;
      }
    }

    if (title == null) throw new Exception("Window not found: " + keyword);
    Console.Error.WriteLine("MATCH:" + title);
    var hWnd = FindByTitle(title);
    SetForegroundWindow(hWnd);
    Sleep(300);
    return hWnd;
  }

  private static void CaptureWindow(IntPtr hWnd, string outPath) {
    int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    RECT rect;
    int hr = DwmGetWindowAttribute(hWnd, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf<RECT>());
    if (hr != 0) GetWindowRect(hWnd, out rect);
    int w = rect.Right - rect.Left;
    int h = rect.Bottom - rect.Top;
    if (w <= 0 || h <= 0) throw new Exception("Invalid window dimensions");

    using (var bmp = new Bitmap(w, h)) {
      using (var g = Graphics.FromImage(bmp)) {
        var destDc = g.GetHdc();
        var srcDc = GetDC(IntPtr.Zero);
        BitBlt(destDc, 0, 0, w, h, srcDc, rect.Left, rect.Top, SRCCOPY);
        ReleaseDC(IntPtr.Zero, srcDc);
        g.ReleaseHdc(destDc);
      }
      bmp.Save(outPath, ImageFormat.Png);
    }
  }

  public static void CaptureLandscape(IntPtr hWnd, string outPath) {
    var monitor = MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST);
    var mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf<MONITORINFO>();
    GetMonitorInfo(monitor, ref mi);

    int workW = mi.rcWork.Right - mi.rcWork.Left;
    int workH = mi.rcWork.Bottom - mi.rcWork.Top;

    // Landscape 4:3 — height is the constraint, maximize it
    int targetH = workH;
    int targetW = workH * 4 / 3;
    int x = mi.rcWork.Left + (workW - targetW) / 2;
    int y = mi.rcWork.Top;

    // force window out of maximized state
    ShowWindow(hWnd, SW_SHOWNORMAL);
    Sleep(500);

    int oldStyle = GetWindowLong(hWnd, GWL_STYLE);
    SetWindowLong(hWnd, GWL_STYLE, oldStyle & ~WS_THICKFRAME);

    MoveWindow(hWnd, x, y, targetW, targetH, true);
    Sleep(1000);

    SetWindowLong(hWnd, GWL_STYLE, oldStyle);
    SetWindowPos(hWnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);

    SetForegroundWindow(hWnd);
    Sleep(200);
    CaptureWindow(hWnd, outPath);
  }

  public static void CapturePortrait3to4(IntPtr hWnd, string outPath) {
    var monitor = MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST);
    var mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf<MONITORINFO>();
    GetMonitorInfo(monitor, ref mi);

    int workW = mi.rcWork.Right - mi.rcWork.Left;
    int workH = mi.rcWork.Bottom - mi.rcWork.Top;

    // Portrait 3:4 — height is the constraint, maximize it
    int targetH = workH;
    int targetW = workH * 3 / 4;
    int x = mi.rcWork.Left + (workW - targetW) / 2;
    int y = mi.rcWork.Top;

    // force window out of maximized state
    ShowWindow(hWnd, SW_SHOWNORMAL);
    Sleep(500);

    int oldStyle = GetWindowLong(hWnd, GWL_STYLE);
    SetWindowLong(hWnd, GWL_STYLE, oldStyle & ~WS_THICKFRAME);

    MoveWindow(hWnd, x, y, targetW, targetH, true);
    Sleep(1000);

    SetWindowLong(hWnd, GWL_STYLE, oldStyle);
    SetWindowPos(hWnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);

    SetForegroundWindow(hWnd);
    Sleep(200);
    CaptureWindow(hWnd, outPath);
  }
}
'@

$pwshDir = Split-Path ([System.Reflection.Assembly]::LoadWithPartialName("System.Drawing.Common").Location) -Parent
$refs = @(
  Join-Path $pwshDir "System.Drawing.dll"
  Join-Path $pwshDir "System.Drawing.Common.dll"
  Join-Path $pwshDir "System.Drawing.Primitives.dll"
  Join-Path $pwshDir "System.Private.Windows.Core.dll"
  Join-Path $pwshDir "System.Private.Windows.GdiPlus.dll"
  Join-Path $pwshDir "System.ComponentModel.Primitives.dll"
  Join-Path $pwshDir "System.Console.dll"
  Join-Path $pwshDir "System.Diagnostics.Process.dll"
)
$typeName = "WindowCapture_$([DateTime]::Now.Ticks)"
$code = $code -replace 'class WindowCapture', "class $typeName"
Add-Type -TypeDefinition $code -ReferencedAssemblies $refs

$captureType = [Type]$typeName
$hWnd = $null
try {
  $hWnd = $captureType::FindHandle($WindowTitle)
} catch {
  Write-Error $_.Exception.Message; exit 1
}

try {
  $captureType::CaptureLandscape($hWnd, $landscapePath)
  Write-Host "✓ 横屏截图已保存: $landscapePath"
} catch {
  Write-Error "横屏截图失败: $($_.Exception.Message)"; exit 1
}

try {
  $captureType::CapturePortrait3to4($hWnd, $portraitPath)
  Write-Host "✓ 竖屏截图已保存: $portraitPath"
} catch {
  Write-Error "竖屏截图失败: $($_.Exception.Message)"; exit 1
}
