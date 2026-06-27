param(
  [Parameter(Position = 0)]
  [string]$OutputDir = ""
)

$scriptDir = Split-Path -Parent $PSCommandPath
if ($OutputDir) {
  $outDir = $OutputDir
} else {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $outDir = Join-Path $scriptDir "screenshot" "$timestamp"
}
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

Add-Type -AssemblyName System.Drawing.Common
Add-Type -AssemblyName System.Windows.Forms

$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class FullscreenCapture {
  [DllImport("gdi32.dll")]
  public static extern bool BitBlt(IntPtr hdc, int x, int y, int w, int h, IntPtr hdcSrc, int xSrc, int ySrc, uint rop);

  [DllImport("user32.dll")]
  public static extern IntPtr GetDC(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);

  [DllImport("user32.dll")]
  public static extern bool EnumDisplaySettings(string lpszDeviceName, int iModeNum, ref DEVMODE lpDevMode);

  [StructLayout(LayoutKind.Sequential)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string dmDeviceName;
    public short dmSpecVersion;
    public short dmDriverVersion;
    public short dmSize;
    public short dmDriverExtra;
    public int dmFields;
    public int dmPositionX;
    public int dmPositionY;
    public int dmDisplayOrientation;
    public int dmDisplayFixedOutput;
    public short dmColor;
    public short dmDuplex;
    public short dmYResolution;
    public short dmTTOption;
    public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel;
    public int dmPelsWidth;
    public int dmPelsHeight;
    public int dmDisplayFlags;
    public int dmDisplayFrequency;
    public int dmICMMethod;
    public int dmICMIntent;
    public int dmMediaType;
    public int dmDitherType;
    public int dmReserved1;
    public int dmReserved2;
    public int dmPanningWidth;
    public int dmPanningHeight;
  }

  const uint SRCCOPY = 0x00CC0020;

  public static void Capture(string outPath) {
    int screenW = (int)System.Windows.Forms.Screen.PrimaryScreen.Bounds.Width;
    int screenH = (int)System.Windows.Forms.Screen.PrimaryScreen.Bounds.Height;

    using (var bmp = new Bitmap(screenW, screenH)) {
      using (var g = Graphics.FromImage(bmp)) {
        var destDc = g.GetHdc();
        var srcDc = GetDC(IntPtr.Zero);
        BitBlt(destDc, 0, 0, screenW, screenH, srcDc, 0, 0, SRCCOPY);
        ReleaseDC(IntPtr.Zero, srcDc);
        g.ReleaseHdc(destDc);
      }
      bmp.Save(outPath, ImageFormat.Png);
    }
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
  Join-Path $pwshDir "System.Windows.Forms.dll"
)
$typeName = "FullscreenCapture_$([DateTime]::Now.Ticks)"
$code = $code -replace 'class FullscreenCapture', "class $typeName"
Add-Type -TypeDefinition $code -ReferencedAssemblies $refs

$captureType = [Type]$typeName
$totalFrames = 25
$intervalMs = 200

Write-Host "Starting in 2 seconds..."
Start-Sleep -Seconds 2

for ($i = 1; $i -le $totalFrames; $i++) {
  $path = Join-Path $outDir "$i.png"
  try {
    $captureType::Capture($path)
    Write-Host "[$i/$totalFrames] $path"
  } catch {
    Write-Error "Frame $i failed: $($_.Exception.Message)"
  }
  if ($i -lt $totalFrames) { Start-Sleep -Milliseconds $intervalMs }
}

Write-Host "Done — $totalFrames frames saved to $outDir"
