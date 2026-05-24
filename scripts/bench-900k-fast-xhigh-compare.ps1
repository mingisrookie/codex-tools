[CmdletBinding()]
param(
  [string]$ProfileId = '',
  [string[]]$ProfileIds = @(),
  [int]$Attempts = 20,
  [int]$TargetBytes = 900000,
  [string]$ProxyUrl = 'http://127.0.0.1:7890'
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
  $Global:PSNativeCommandUseErrorActionPreference = $false
}

$install = 'F:\Codex Tools'
$dataDir = 'F:\Codex Tools\Codex Tools Data'
$accountsPath = Join-Path $dataDir 'accounts.json'

function Stop-App {
  Get-Process | Where-Object { $_.Path -in @((Join-Path $install 'app.exe'), (Join-Path $install 'app-new.exe')) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 700
}

function Start-App {
  Start-Process -FilePath (Join-Path $install 'app-new.exe') -WorkingDirectory $install -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds(20)
  do {
    try {
      if ((Invoke-RestMethod 'http://127.0.0.1:8666/health' -TimeoutSec 2).ok) { return }
    } catch {}
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  throw 'health timeout'
}

function Read-Store { Get-Content $accountsPath -Raw | ConvertFrom-Json }
function Write-Store($s) { [IO.File]::WriteAllText($accountsPath, ($s | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false)) }
function Read-Account($profileId) {
  $store = Read-Store
  $acct = $store.accounts | Where-Object id -eq $profileId | Select-Object -First 1
  if (-not $acct) { throw "account not found: $profileId" }
  $acct
}
function Account-Key($a) {
  $p = [string]$a.principalId
  if ([string]::IsNullOrWhiteSpace($p)) { $p = [string]$a.email }
  if ($p.Contains('@')) { $p = $p.ToLowerInvariant() }
  "$p|$($a.accountId)"
}
function Set-SequentialProfile($profileId) {
  $acct = Read-Account $profileId
  $s = Read-Store
  $s.settings.apiProxyLoadBalanceMode = 'sequential'
  $s.settings.apiProxySequentialFiveHourLimitPercent = 100
  $s.settings.apiProxySequentialAccountKey = Account-Key $acct
  Write-Store $s
  $acct
}
function Read-AccountSnapshot($profileId) {
  $acct = Read-Account $profileId
  [pscustomobject]@{
    profileId = [string]$acct.id
    label = [string]$acct.email
    accountId = [string]$acct.authJson.tokens.account_id
    accessToken = [string]$acct.authJson.tokens.access_token
  }
}

$store0 = Read-Store
$origMode = $store0.settings.apiProxyLoadBalanceMode
$origKey = $store0.settings.apiProxySequentialAccountKey
$origLimit = $store0.settings.apiProxySequentialFiveHourLimitPercent

[string[]]$profileQueue = if ($ProfileIds -and $ProfileIds.Count -gt 0) {
  @($ProfileIds)
} elseif (-not [string]::IsNullOrWhiteSpace($ProfileId)) {
  @($ProfileId)
} else {
  throw 'Pass -ProfileId or -ProfileIds with authorized account profile ids.'
}
foreach ($id in $profileQueue) { [void](Read-Account $id) }

Stop-App
try {
  [void](Set-SequentialProfile $profileQueue[0])
  Start-App

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $outDir = "F:\codex-tools\output\compare-900k-fast-xhigh-$stamp"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null

  $proxyKey = (Get-Content (Join-Path $dataDir 'api-proxy.key') -Raw).Trim()

  $para = 'Latency probe paragraph. Ordinary repeated context for measuring upload and upstream response header timing. Reply OK only. 0123456789 abcdefghijklmnopqrstuvwxyz. '
  function LongText($nonce) {
    $sb = [Text.StringBuilder]::new()
    [void]$sb.AppendLine("nonce=$nonce")
    while ([Text.Encoding]::UTF8.GetByteCount($sb.ToString()) -lt $TargetBytes) {
      [void]$sb.Append($para)
    }
    [void]$sb.AppendLine()
    [void]$sb.Append('Final instruction: reply exactly OK.')
    $sb.ToString()
  }

  function Payload($nonce, $tier, $normalized) {
    $p = [ordered]@{
      model = 'gpt-5.5'
      instructions = 'You are a helpful assistant.'
      input = @(
        [ordered]@{
          role = 'user'
          content = @(
            [ordered]@{
              type = 'input_text'
              text = (LongText $nonce)
            }
          )
        }
      )
      reasoning = [ordered]@{ effort = 'xhigh' }
      stream = $true
      store = $false
    }
    if ($normalized) {
      $p.parallel_tool_calls = $true
      $p.reasoning.summary = 'auto'
    }
    if ($tier) { $p.service_tier = $tier }
    ($p | ConvertTo-Json -Depth 20 -Compress)
  }

  function RunOne([string]$name, [string]$url, [string[]]$headers, [string]$proxy, [string]$payload) {
    $body = Join-Path $outDir "body-$name.json"
    $out = Join-Path $outDir "resp-$name.sse"
    $err = Join-Path $outDir "err-$name.txt"
    $cfg = Join-Path $outDir "curl-$name.cfg"
    [IO.File]::WriteAllText($body, $payload, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllLines($cfg, ($headers | ForEach-Object { "header = `"$_`"" }), [Text.UTF8Encoding]::new($false))
    $args = @('-K', $cfg, '-sS', '-N', '--connect-timeout', '20', '--max-time', '240', '-o', $out, '-w', '%{http_code} %{time_starttransfer} %{time_total} %{size_upload} %{size_download}')
    if ($proxy) { $args += @('--proxy', $proxy, '--ssl-no-revoke') }
    $args += @('--data-binary', "@$body", $url)
    $raw = & curl.exe @args 2>$err
    $exit = $LASTEXITCODE
    $parts = (($raw -join '')).Trim() -split '\s+'
    $resp = if (Test-Path $out) { Get-Content $out -Raw } else { '' }
    Remove-Item -LiteralPath $cfg -Force -ErrorAction SilentlyContinue
    [pscustomobject]@{
      name = $name
      http = [int]$parts[0]
      exit = $exit
      ok = ($exit -eq 0 -and [int]$parts[0] -eq 200 -and $resp -match 'response.completed')
      ttfb = [double]$parts[1]
      total = [double]$parts[2]
      upload = [int64]$parts[3]
      download = [int64]$parts[4]
    }
  }

  function RunCodexBench([int]$index, [string]$profileId, [string]$session, [string]$nonce, [string]$order) {
    $snapshot = Read-AccountSnapshot $profileId
    $proxyHeaders = @(
      "Authorization: Bearer $proxyKey",
      "ChatGPT-Account-Id: $($snapshot.accountId)",
      'Accept: text/event-stream',
      'Content-Type: application/json',
      'Originator: codex_cli_rs',
      'Version: 0.125.0',
      "Session_id: $session",
      'User-Agent: codex_cli_rs/0.125.0'
    )
    $codex = Payload $nonce 'fast' $true
    $r = RunOne "codex_tools_$index" 'http://127.0.0.1:8666/v1/responses' $proxyHeaders $null $codex
    $r | Add-Member -NotePropertyName profileId -NotePropertyValue $snapshot.profileId
    $r | Add-Member -NotePropertyName accountId -NotePropertyValue $snapshot.accountId
    $r | Add-Member -NotePropertyName order -NotePropertyValue $order
    $r
  }

  function RunDirectBench([int]$index, [string]$profileId, [string]$session, [string]$nonce, [string]$order) {
    $snapshot = Read-AccountSnapshot $profileId
    $directHeaders = @(
      "Authorization: Bearer $($snapshot.accessToken)",
      "ChatGPT-Account-Id: $($snapshot.accountId)",
      'Accept: text/event-stream',
      'Content-Type: application/json',
      'Originator: codex_cli_rs',
      'Version: 0.125.0',
      "Session_id: $session",
      'User-Agent: codex_cli_rs/0.125.0',
      'Connection: Keep-Alive'
    )
    $direct = Payload $nonce 'priority' $true
    $r = RunOne "direct_norm_$index" 'https://chatgpt.com/backend-api/codex/responses' $directHeaders $ProxyUrl $direct
    $r | Add-Member -NotePropertyName profileId -NotePropertyValue $snapshot.profileId
    $r | Add-Member -NotePropertyName accountId -NotePropertyValue $snapshot.accountId
    $r | Add-Member -NotePropertyName order -NotePropertyValue $order
    $r
  }

  function AddBenchRow($row) {
    $script:rows += $row
    "BENCH $($row.name) order=$($row.order) http=$($row.http) ok=$($row.ok) ttfb=$($row.ttfb)s total=$($row.total)s bytes=$($row.upload)"
  }

  $rows = @()
  try {
    for ($i = 1; $i -le $Attempts; $i++) {
      $session = [guid]::NewGuid().ToString()
      $attemptProfileId = $profileQueue[($i - 1) % $profileQueue.Count]
      $nonce = "pair-$i"
      $order = if (($i % 2) -eq 1) { 'codex_first' } else { 'direct_first' }
      if ($order -eq 'codex_first') {
        AddBenchRow (RunCodexBench $i $attemptProfileId $session $nonce $order)
        Start-Sleep -Milliseconds 300
        AddBenchRow (RunDirectBench $i $attemptProfileId $session $nonce $order)
      } else {
        AddBenchRow (RunDirectBench $i $attemptProfileId $session $nonce $order)
        Start-Sleep -Milliseconds 300
        AddBenchRow (RunCodexBench $i $attemptProfileId $session $nonce $order)
      }
      Start-Sleep -Milliseconds 300
    }

    $csvPath = Join-Path $outDir 'results.csv'
    $rows | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8

    $summary = $rows |
      Group-Object { $_.name -replace '_\d+$', '' } |
      ForEach-Object {
        $ok = @($_.Group | Where-Object ok)
        $ttfbSorted = @($ok.ttfb | Sort-Object)
        $totalSorted = @($ok.total | Sort-Object)
        [pscustomobject]@{
          variant = $_.Name
          n = $ok.Count
          ttfb_avg = [math]::Round((($ok.ttfb | Measure-Object -Average).Average), 3)
          ttfb_med = if ($ok.Count -gt 0) { [math]::Round($ttfbSorted[[int]([math]::Floor(($ok.Count - 1) / 2))], 3) } else { [double]::NaN }
          total_avg = [math]::Round((($ok.total | Measure-Object -Average).Average), 3)
          total_med = if ($ok.Count -gt 0) { [math]::Round($totalSorted[[int]([math]::Floor(($ok.Count - 1) / 2))], 3) } else { [double]::NaN }
        }
      }

    $summaryPath = Join-Path $outDir 'summary.json'
    $summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

    $pairs = for ($i = 1; $i -le $Attempts; $i++) {
      $codexRow = $rows | Where-Object name -eq "codex_tools_$i" | Select-Object -First 1
      $directRow = $rows | Where-Object name -eq "direct_norm_$i" | Select-Object -First 1
      if ($codexRow -and $directRow) {
        [pscustomobject]@{
          pair = $i
          order = $codexRow.order
          profileId = $codexRow.profileId
          accountId = $codexRow.accountId
          ok = ($codexRow.ok -and $directRow.ok)
          codex_ttfb = $codexRow.ttfb
          direct_ttfb = $directRow.ttfb
          ttfb_delta = [math]::Round($codexRow.ttfb - $directRow.ttfb, 6)
          ttfb_abs_delta = [math]::Round([math]::Abs($codexRow.ttfb - $directRow.ttfb), 6)
          codex_total = $codexRow.total
          direct_total = $directRow.total
          total_delta = [math]::Round($codexRow.total - $directRow.total, 6)
          total_abs_delta = [math]::Round([math]::Abs($codexRow.total - $directRow.total), 6)
        }
      }
    }
    $pairsPath = Join-Path $outDir 'paired.csv'
    $pairs | Export-Csv -LiteralPath $pairsPath -NoTypeInformation -Encoding UTF8
    $okPairs = @($pairs | Where-Object ok)
    $pairedSummary = [pscustomobject]@{
      target_pairs = $Attempts
      ok_pairs = $okPairs.Count
      request_bytes = [pscustomobject]@{
        codex_tools = (($rows | Where-Object name -eq 'codex_tools_1' | Select-Object -First 1).upload)
        direct_norm = (($rows | Where-Object name -eq 'direct_norm_1' | Select-Object -First 1).upload)
      }
      avg_ttfb_delta = if ($okPairs.Count) { [math]::Round((($okPairs.ttfb_delta | Measure-Object -Average).Average), 6) } else { [double]::NaN }
      avg_ttfb_abs_delta = if ($okPairs.Count) { [math]::Round((($okPairs.ttfb_abs_delta | Measure-Object -Average).Average), 6) } else { [double]::NaN }
      avg_total_delta = if ($okPairs.Count) { [math]::Round((($okPairs.total_delta | Measure-Object -Average).Average), 6) } else { [double]::NaN }
      avg_total_abs_delta = if ($okPairs.Count) { [math]::Round((($okPairs.total_abs_delta | Measure-Object -Average).Average), 6) } else { [double]::NaN }
    }
    $pairedSummaryPath = Join-Path $outDir 'paired-summary.json'
    $pairedSummary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $pairedSummaryPath -Encoding UTF8
    [pscustomobject]@{ out_dir = $outDir; csv = $csvPath; summary = $summaryPath; paired = $pairsPath; paired_summary = $pairedSummaryPath; summary_data = $summary; paired_summary_data = $pairedSummary } | ConvertTo-Json -Depth 12
  } finally {
    Stop-App
  }
}
finally {
  $s = Read-Store
  $s.settings.apiProxyLoadBalanceMode = $origMode
  $s.settings.apiProxySequentialFiveHourLimitPercent = $origLimit
  if ($null -eq $origKey) { $s.settings.apiProxySequentialAccountKey = $null } else { $s.settings.apiProxySequentialAccountKey = $origKey }
  Write-Store $s
  Start-App
}
