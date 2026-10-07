$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $scriptDir 'backend'
$frontendDir = Join-Path $scriptDir 'frontend'
$venvDir = Join-Path $backendDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$backendUrl = 'http://127.0.0.1:8000'
$frontendUrl = 'http://127.0.0.1:5500'
$backendProcess = $null
$frontendProcess = $null
$backendLog = Join-Path $env:TEMP 'elite-backend.log'
$backendErrorLog = Join-Path $env:TEMP 'elite-backend-error.log'
$frontendLog = Join-Path $env:TEMP 'elite-frontend.log'
$frontendErrorLog = Join-Path $env:TEMP 'elite-frontend-error.log'

function Test-HttpEndpoint([string]$Url) {
    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

function Test-PortInUse([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

try {
    if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw 'Python 3 não foi encontrado. Instale Python 3.10+ e tente novamente.'
    }

    foreach ($port in @(8000, 5500)) {
        if (Test-PortInUse $port) {
            throw "A porta $port já está em uso. Encerre o serviço que a utiliza e tente novamente."
        }
    }

    if (-not (Test-Path $venvPython)) {
        Write-Host 'Criando ambiente virtual do backend...'
        if (Get-Command py -ErrorAction SilentlyContinue) {
            & py -3 -m venv $venvDir
        } else {
            & python -m venv $venvDir
        }
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o ambiente virtual Python.' }
    }

    & $venvPython -c 'import fastapi, uvicorn, sqlalchemy, pymysql' 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Instalando dependências do backend...'
        & $venvPython -m pip install -r (Join-Path $backendDir 'requirements.txt')
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as dependências do backend.' }
    }

    $backendProcess = Start-Process -FilePath $venvPython `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
        -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $backendLog -RedirectStandardError $backendErrorLog

    $frontendProcess = Start-Process -FilePath $venvPython `
        -ArgumentList @('-m', 'http.server', '5500', '--bind', '127.0.0.1') `
        -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrorLog

    Write-Host 'Iniciando backend e frontend...'
    $deadline = (Get-Date).AddSeconds(60)
    $backendReady = $false
    $frontendReady = $false
    while ((Get-Date) -lt $deadline) {
        if (-not $backendProcess.HasExited) { $backendReady = Test-HttpEndpoint "$backendUrl/health" }
        if (-not $frontendProcess.HasExited) { $frontendReady = Test-HttpEndpoint "$frontendUrl/" }
        if ($backendReady -and $frontendReady) { break }
        if ($backendProcess.HasExited -or $frontendProcess.HasExited) { break }
        Start-Sleep -Seconds 1
    }

    if (-not ($backendReady -and $frontendReady)) {
        Write-Host "`nLog do backend: $backendLog" -ForegroundColor Yellow
        if (Test-Path $backendLog) { Get-Content $backendLog -Tail 30 }
        if (Test-Path $backendErrorLog) { Get-Content $backendErrorLog -Tail 30 }
        Write-Host "`nLog do frontend: $frontendLog" -ForegroundColor Yellow
        if (Test-Path $frontendLog) { Get-Content $frontendLog -Tail 30 }
        if (Test-Path $frontendErrorLog) { Get-Content $frontendErrorLog -Tail 30 }
        throw 'Os serviços não ficaram prontos. Confira os logs acima; o MySQL e o schema elitefaturamento devem estar disponíveis.'
    }

    Write-Host "`nCliente iniciado com sucesso:" -ForegroundColor Green
    Write-Host "Frontend: $frontendUrl"
    Write-Host "Backend:  $backendUrl"
    Write-Host "Swagger:  $backendUrl/docs"
    Write-Host "`nPressione Ctrl+C para encerrar os dois serviços."

    while (-not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
        Start-Sleep -Seconds 1
    }
} catch {
    Write-Error $_
    exit 1
} finally {
    foreach ($process in @($frontendProcess, $backendProcess)) {
        if ($null -ne $process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
