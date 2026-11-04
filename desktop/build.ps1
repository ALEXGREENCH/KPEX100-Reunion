param(
    [switch]$WithoutOriginals,
    [switch]$WithSmaf,
    [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
        & $Python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment' }
    }
    $buildPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    & $buildPython -m pip install -r requirements-dev.txt
    if ($LASTEXITCODE -ne 0) { throw 'Could not install dependencies' }
    $includeOriginals = -not $WithoutOriginals
    if ($includeOriginals) {
        & $buildPython -c 'from kpex.assets import prepare_bundled_assets; prepare_bundled_assets()'
        if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the shared original collection' }
        & $buildPython tools/assets.py verify --require-all
        if ($LASTEXITCODE -ne 0) { throw 'Original files are missing or changed; restore web/data or import a complete collection' }
    }
    & $buildPython tools/prepare_bootloader.py
    if ($LASTEXITCODE -ne 0) { throw 'Bootloader build failed. Install MSVC Build Tools or LLVM-MinGW, then retry.' }

    if ($WithSmaf) {
        & $buildPython tools/build_smaf.py
        if ($LASTEXITCODE -ne 0) { throw 'SMAF renderer build failed (LLVM-MinGW clang++ required)' }
    }
    $testArgs = @('-m', 'pytest', '-p', 'no:faulthandler', 'tests', '-q')
    if ($includeOriginals) { $testArgs += '--with-originals' }
    & $buildPython @testArgs
    if ($LASTEXITCODE -ne 0) { throw 'Validation failed; build stopped' }

    $packagePath = Join-Path $PSScriptRoot 'build\package'
    # Rebuild a fresh package, including when changing optional components.
    # Verify the one build-output path before removing its contents.
    if (Test-Path -LiteralPath $packagePath) {
        $resolvedPackage = (Resolve-Path -LiteralPath $packagePath).Path
        $expectedPackage = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'build\package'))
        $buildFolder = Get-Item -LiteralPath (Join-Path $PSScriptRoot 'build')
        if ($resolvedPackage -ne $expectedPackage -or (Get-Item -LiteralPath $packagePath).LinkType -or $buildFolder.LinkType) {
            throw 'Refusing to clean an unexpected package output path'
        }
        Remove-Item -LiteralPath $resolvedPackage -Recurse -Force
    }
    $packageArgs = @('-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile', '--windowed', '--collect-all', 'unicorn', '--name', 'Reunion', '--distpath', $packagePath, '--workpath', 'build\pyinstaller', '--specpath', 'build')
    if ($WithSmaf) {
        $rendererPath = Join-Path $PSScriptRoot 'bin\smaf-render.exe'
        $packageArgs += @('--add-binary', ($rendererPath + ';bin'))
    }
    $packageArgs += 'launch.py'
    & $buildPython @packageArgs
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

    if ($includeOriginals) {
        # Copy only catalogued originals; other local data/saves stay local.
        $assetRecords = Get-Content -LiteralPath 'data/manifest.json' -Raw | ConvertFrom-Json
        foreach ($assetRecord in $assetRecords) {
            $assetTarget = Join-Path $packagePath $assetRecord.path
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($assetTarget))
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot $assetRecord.path) -Destination $assetTarget
        }
        Copy-Item -LiteralPath 'data/manifest.json' -Destination (Join-Path $packagePath 'data\manifest.json')
    }
    Copy-Item -LiteralPath 'licenses' -Destination $packagePath -Recurse -Force
    Copy-Item -LiteralPath '..\LICENSE' -Destination (Join-Path $packagePath 'LICENSE')
    Copy-Item -LiteralPath '..\THIRD_PARTY.md' -Destination (Join-Path $packagePath 'THIRD_PARTY.md')
    $smokeReport = Join-Path $PSScriptRoot 'build\standalone-smoke.json'
    $smokeArgs = @('--self-test', ('"' + $smokeReport + '"'))
    if ($includeOriginals) { $smokeArgs += '--self-test-originals' }
    $smokeProcess = Start-Process -FilePath (Join-Path $packagePath 'Reunion.exe') -ArgumentList $smokeArgs -WindowStyle Hidden -Wait -PassThru
    if ($smokeProcess.ExitCode -ne 0) { throw 'Standalone ARM execution failed; see build/standalone-smoke.json' }
    Write-Host "Ready: $packagePath\Reunion.exe"
}
finally {
    Pop-Location
}
