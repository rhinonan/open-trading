$url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
$zip = "$env:TEMP\ffmpeg.zip"
$dest = "$env:LOCALAPPDATA\ffmpeg"

Write-Host "Downloading ffmpeg..."
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "Extracting..."
Expand-Archive -Path $zip -DestinationPath "$env:TEMP\ffmpeg-extract" -Force
$bin = Get-ChildItem -Path "$env:TEMP\ffmpeg-extract" -Directory | Select-Object -First 1

New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item "$($bin.FullName)\bin\*" $dest -Recurse

Write-Host "Adding to PATH for current session..."
$env:Path = "$dest;$env:Path"
[Environment]::SetEnvironmentVariable("Path", "$dest;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")

Write-Host "Done. ffmpeg installed to $dest"
ffmpeg -version
