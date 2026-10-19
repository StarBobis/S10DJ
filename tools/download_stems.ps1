# 下载社区提取的云顶 S10（强音争霸）全部分轨
$ErrorActionPreference = 'Continue'
$base = 'https://tftmixer.officiallysp.net/tracks/'
$out = 'D:\Dev\S10DJ\stems\aac'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$list = Get-Content 'D:\Dev\S10DJ\stems\tracklist.txt'
$ok = 0; $skip = 0; $fail = @()
foreach ($t in $list) {
    $dest = Join-Path $out $t
    if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 10000)) { $skip++; continue }
    & curl.exe -k -s -L --retry 3 --retry-delay 2 --max-time 120 -A "Mozilla/5.0" -o $dest "$base$t"
    if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 10000)) { $ok++ } else { $fail += $t }
}
"downloaded=$ok skipped=$skip failed=$($fail.Count)"
if ($fail.Count) { "FAILED: " + ($fail -join ', ') }
$total = (Get-ChildItem $out -File | Measure-Object -Property Length -Sum).Sum
"total: {0:N1} MB" -f ($total/1MB)
