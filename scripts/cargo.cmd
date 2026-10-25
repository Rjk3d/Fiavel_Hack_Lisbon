@echo off
rem Runs cargo with the Visual Studio Build Tools 2022 environment.
rem Needed on machines where another Visual Studio without the C++ workload is found first.
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
cargo %*
