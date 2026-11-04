$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'src'
$output = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../bin/smaf-render.exe'))
& clang++ -std=c++20 -O2 -static "-I$src" (Join-Path $PSScriptRoot 'example/smaf-render.cpp') (Join-Path $src 'smaf_file.cpp') (Join-Path $src 'smaf_voice.cpp') (Join-Path $src 'ma_player.cpp') (Join-Path $src 'ma_fm_core.cpp') -o $output
if ($LASTEXITCODE -ne 0) { throw 'SMAF renderer compilation failed' }
