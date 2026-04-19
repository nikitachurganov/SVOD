# Create backend\.venv with Python 3.11–3.13 and install deps (binary wheels — no MSVC required).
# Run from the backend folder:  .\install-deps.ps1
#
# Python 3.14 on Windows often lacks wheels for asyncpg/pydantic-core → pip builds from source
# and fails with "link.exe not found" unless Visual Studio Build Tools are installed.

$ErrorActionPreference = 'Stop'
$Req = Join-Path $PSScriptRoot 'requirements.txt'
$VenvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'

function Get-PyLauncherExe {
    param([string]$Tag)
    try {
        $out = & py "-$Tag" -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $out) { return $out.Trim() }
    } catch {}
    return $null
}

$PythonExe = $null
foreach ($tag in @('3.12', '3.13', '3.11')) {
    $PythonExe = Get-PyLauncherExe $tag
    if ($PythonExe) {
        Write-Host "Using Python launcher: py -$tag -> $PythonExe"
        break
    }
}

if (-not $PythonExe) {
    $dummy = & python -c "import sys; raise SystemExit(2 if sys.version_info >= (3, 14) else 0)" 2>$null
    if ($LASTEXITCODE -eq 2) {
        Write-Host ""
        Write-Host "ERROR: Active Python is 3.14 or newer. Pip will try to build asyncpg and pydantic-core from source."
        Write-Host "That requires MSVC link.exe (Visual Studio Build Tools)."
        Write-Host ""
        Write-Host "Fix: install Python 3.12 (64-bit) from https://www.python.org/downloads/"
        Write-Host 'Enable "py launcher" in the installer, then run this script again.'
        Write-Host ""
        exit 1
    }
    $PythonExe = (Get-Command python -ErrorAction Stop).Source
    Write-Host "Using PATH Python: $PythonExe"
}

if (Test-Path $VenvPython) {
    $maj = [int](& $VenvPython -c "import sys; print(sys.version_info[0])")
    $min = [int](& $VenvPython -c "import sys; print(sys.version_info[1])")
    if ($maj -gt 3 -or ($maj -eq 3 -and $min -ge 14)) {
        Write-Host "Removing .venv (Python $maj.$min); 3.14+ needs MSVC to install deps — recreating with supported Python..."
        Remove-Item -Recurse -Force (Join-Path $PSScriptRoot '.venv')
    }
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating virtualenv .venv ..."
    & $PythonExe -m venv (Join-Path $PSScriptRoot '.venv')
}

Write-Host "Installing packages into .venv ..."
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r $Req
Write-Host "Done. Activate with: .\.venv\Scripts\Activate.ps1"
