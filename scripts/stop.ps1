# Stops TOLPRAMAN dev processes that still hold their ports (3000 web, 4000 API, 27027 embedded MongoDB).
# Use when "EADDRINUSE: address already in use" appears. Only processes from this project folder are stopped.
$root = (Resolve-Path "$PSScriptRoot\..").Path
foreach ($port in 3000, 4000, 27027) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
    if ($p -and ($p.CommandLine -like "*$root*" -or $p.CommandLine -like "*TOLPRAMAN*")) {
      Stop-Process -Id $p.ProcessId -Force
      Write-Host "Stopped port $port (PID $($p.ProcessId))"
    } elseif ($p) {
      Write-Host "Port $port is used by another program (PID $($p.ProcessId)): $($p.Name) - not stopped"
    }
  }
}
