# Envía un archivo de comandos (ZPL) a la etiquetadora conectada por USB, sin driver y sin permisos de administrador.
# Uso:  imprimir-usb.ps1 -Archivo etiqueta.zpl      imprime
#       imprimir-usb.ps1 -Listar                    muestra las impresoras USB que encuentra
# La impresora se busca por su identificador USB (por defecto 2AAF, que es HPRT/CBX). Con $env:ETIQUETAS_USB se puede elegir otra.
param([string]$Archivo = '', [switch]$Listar)
$ErrorActionPreference = 'Stop'

$cs = @"
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class UsbImpresora {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool WriteFile(SafeFileHandle h, byte[] b, uint n, out uint written, IntPtr ov);
  public static void Enviar(string ruta, byte[] datos) {
    SafeFileHandle h = CreateFile(ruta, 0x40000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (h.IsInvalid) throw new Exception("No se pudo abrir la impresora (error de Windows " + Marshal.GetLastWin32Error() + "). ¿Está encendida y conectada?");
    try {
      int pos = 0;
      while (pos < datos.Length) {
        int n = Math.Min(4096, datos.Length - pos);
        byte[] trozo = new byte[n];
        Array.Copy(datos, pos, trozo, 0, n);
        uint escrito;
        if (!WriteFile(h, trozo, (uint)n, out escrito, IntPtr.Zero)) throw new Exception("Falló el envío a la impresora (error de Windows " + Marshal.GetLastWin32Error() + ")");
        pos += n;
      }
    } finally { h.Close(); }
  }
}
"@
Add-Type -TypeDefinition $cs

# Impresoras USB conectadas (clase de dispositivos «USB print»)
$clase = 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'
$filtro = if ($env:ETIQUETAS_USB) { $env:ETIQUETAS_USB } else { '2AAF' }
$rutas = @()
if (Test-Path $clase) {
  foreach ($k in Get-ChildItem $clase) {
    $nombre = $k.PSChildName                      # ##?#USB#VID_2AAF&PID_9014#T4000025250196#{guid}
    if ($nombre -like '##?#*') { $rutas += ('\\?\' + $nombre.Substring(4)) }
  }
}
$elegidas = @($rutas | Where-Object { $_ -match [regex]::Escape($filtro) })

if ($Listar) {
  if ($elegidas.Count) { $elegidas | ForEach-Object { 'IMPRESORA ' + $_ } } else { 'SIN_IMPRESORA' }
  exit 0
}
if (-not $elegidas.Count) { Write-Error 'No se encontró la etiquetadora por USB. Revisa que esté encendida y conectada.'; exit 2 }
if (-not $Archivo -or -not (Test-Path $Archivo)) { Write-Error 'Falta el archivo de la etiqueta.'; exit 3 }

$datos = [System.IO.File]::ReadAllBytes($Archivo)
# Windows guarda también las impresoras que ya no están conectadas: se prueba una por una hasta que alguna responda
$ultimoError = ''
foreach ($ruta in $elegidas) {
  try { [UsbImpresora]::Enviar($ruta, $datos); "OK $($datos.Length)"; exit 0 } catch { $ultimoError = $_.Exception.Message }
}
Write-Error $ultimoError
exit 4
