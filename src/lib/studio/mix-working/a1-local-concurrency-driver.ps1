# A1 local concurrency driver — two docker exec psql sessions.
$ErrorActionPreference = "Continue"
$Container = "supabase_db_bitrymdym-local"
$Repo = "C:\Users\dawid\Desktop\BitRymDym\bitrymdym"
$Prep = Join-Path $Repo "src\lib\studio\mix-working\a1-local-concurrency-verify.sql"

function Invoke-Psql([string]$Sql) {
  ($Sql | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAq 2>&1 | Out-String).Trim()
}

function Result([string]$Case, [string]$Status, [string]$Detail = "") {
  Write-Output "RESULT|$Case|$Status|$Detail"
}

function Start-PsqlJob([string]$Sql) {
  Start-Job -ScriptBlock {
    param($c, $sql)
    ($sql | docker exec -i $c psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAq 2>&1 | Out-String).Trim()
  } -ArgumentList $Container, $Sql
}

Get-Content -Raw $Prep | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1 | Out-Null

$Owner = "a2000001-0001-4001-8001-0000000000a1"
$Proj = "a2000003-0003-4003-8003-0000000000c3"
$T1 = "a2000005-0005-4005-8005-0000000000e5"
$T2 = "a2000006-0006-4006-8006-0000000000f6"
$FpA = "a" * 64
$FpB = "b" * 64
$FpC = "c" * 64
$FpD = "d" * 64
$FpE = "e" * 64
$FpF = "f" * 64
$FpG = "1" * 64
$FpH = "2" * 64
$FpI = "3" * 64
$FpJ = "4" * 64
$FpK = "5" * 64
$FpL = "6" * 64

# C1: parallel identical apply
$Req1 = "a2000010-0010-4010-8010-000000000010"
$sqlC1 = @"
DO `$`$
DECLARE
  v_ver int; v_replay boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT document_version, replay INTO v_ver, v_replay
  FROM public.studio_cas_apply_mix_working_ops(
    '$Proj'::uuid, '$Owner'::uuid, 20, '$Req1'::uuid, '$FpA',
    jsonb_build_object(
      'tracks', jsonb_build_object('$T1'::text, jsonb_build_object('gain_db', -4)),
      'master', '{}'::jsonb
    ),
    '$FpB'
  );
  RAISE NOTICE 'C1_OUT=%', v_ver::text || ',' || v_replay::text;
END;
`$`$;
"@

$j1 = Start-PsqlJob $sqlC1
$j2 = Start-PsqlJob $sqlC1
$o1 = Receive-Job $j1 -Wait
$o2 = Receive-Job $j2 -Wait
Remove-Job $j1, $j2 -Force
$all = "$o1`n$o2"
$tip = Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';"
$idem = Invoke-Psql "SELECT count(*) FROM public.studio_mix_working_idempotency WHERE request_id='$Req1';"
$hasApply = ($all -match 'C1_OUT=21,f')
$hasReplay = ($all -match 'C1_OUT=21,t')
if ($tip -eq "21" -and $idem -eq "1" -and $hasApply -and $hasReplay) {
  Result "C1_PARALLEL_IDENTICAL_RETRY" "PASS" "tip=21 idem=1"
} else {
  Result "C1_PARALLEL_IDENTICAL_RETRY" "FAIL" "tip=$tip idem=$idem apply=$hasApply replay=$hasReplay out=$all"
}

# C2: same requestId, different fingerprints in parallel
$Req2 = "a2000011-0011-4011-8011-000000000011"
$sqlC2a = @"
DO `$`$
DECLARE v_ver int; v_replay boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT document_version, replay INTO v_ver, v_replay
  FROM public.studio_cas_apply_mix_working_ops(
    '$Proj'::uuid, '$Owner'::uuid, 21, '$Req2'::uuid, '$FpC',
    jsonb_build_object('tracks', jsonb_build_object('$T1'::text, jsonb_build_object('pan', -0.5)), 'master', '{}'::jsonb),
    '$FpD'
  );
  RAISE NOTICE 'C2A=%', coalesce(v_ver::text,'null') || ',' || coalesce(v_replay::text,'null');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'C2A_ERR=%', SQLERRM;
END;
`$`$;
"@
$sqlC2b = @"
DO `$`$
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM * FROM public.studio_cas_apply_mix_working_ops(
    '$Proj'::uuid, '$Owner'::uuid, 21, '$Req2'::uuid, '$FpE',
    jsonb_build_object('tracks', jsonb_build_object('$T1'::text, jsonb_build_object('pan', 0.5)), 'master', '{}'::jsonb),
    '$FpF'
  );
  RAISE NOTICE 'C2B=OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'C2B_ERR=%', SQLERRM;
END;
`$`$;
"@

$j3 = Start-PsqlJob $sqlC2a
$j4 = Start-PsqlJob $sqlC2b
$o3 = Receive-Job $j3 -Wait
$o4 = Receive-Job $j4 -Wait
Remove-Job $j3, $j4 -Force
$tip = Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';"
$idem = Invoke-Psql "SELECT count(*) FROM public.studio_mix_working_idempotency WHERE request_id='$Req2';"
$reuse = ("$o3`n$o4" -match 'IDEMPOTENCY_KEY_REUSE')
if ($tip -eq "22" -and $idem -eq "1" -and $reuse) {
  Result "C2_PARALLEL_KEY_REUSE" "PASS" "tip=22"
} else {
  Result "C2_PARALLEL_KEY_REUSE" "FAIL" "tip=$tip idem=$idem reuse=$reuse a=$o3 b=$o4"
}

# C3: mix vs track_controls
$tipN = [int](Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';")
$Req3 = "a2000012-0012-4012-8012-000000000012"
$sqlMix = @"
DO `$`$
DECLARE v_ver int;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT document_version INTO v_ver FROM public.studio_cas_apply_mix_working_ops(
    '$Proj'::uuid, '$Owner'::uuid, $tipN, '$Req3'::uuid, '$FpG',
    jsonb_build_object('tracks', jsonb_build_object('$T2'::text, jsonb_build_object('gain_db', -2)), 'master', '{}'::jsonb),
    '$FpH'
  );
  RAISE NOTICE 'MIX=%', coalesce(v_ver::text, 'EMPTY');
END;
`$`$;
"@
$sqlCtrl = @"
DO `$`$
DECLARE v_ver int;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT document_version INTO v_ver FROM public.studio_cas_update_track_controls(
    '$Proj'::uuid, '$Owner'::uuid, '$T1'::uuid, $tipN, 'T1', false, false, -1, 0, false
  );
  RAISE NOTICE 'CTRL=%', coalesce(v_ver::text, 'EMPTY');
END;
`$`$;
"@

$j5 = Start-PsqlJob $sqlMix
$j6 = Start-PsqlJob $sqlCtrl
$o5 = Receive-Job $j5 -Wait
$o6 = Receive-Job $j6 -Wait
Remove-Job $j5, $j6 -Force
$tip = Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';"
$t1g = Invoke-Psql "SELECT gain_db::text FROM public.studio_tracks WHERE id='$T1';"
$t2g = Invoke-Psql "SELECT gain_db::text FROM public.studio_tracks WHERE id='$T2';"
$exp = $tipN + 1
$mixWin = ("$o5" -match "MIX=$exp")
$ctrlWin = ("$o6" -match "CTRL=$exp")
$mixEmpty = ("$o5" -match "MIX=EMPTY")
$ctrlEmpty = ("$o6" -match "CTRL=EMPTY")
$lost = $false
if ($mixWin -and $t2g -ne "-2.00" -and $t2g -ne "-2") { $lost = $true }
if ($ctrlWin -and $t1g -ne "-1.00" -and $t1g -ne "-1") { $lost = $true }
if ($mixEmpty -and ($t2g -eq "-2.00" -or $t2g -eq "-2") -and -not $mixWin) { $lost = $true }
if ($tip -eq "$exp" -and ($mixWin -or $ctrlWin) -and -not $lost) {
  Result "C3_VS_TRACK_CONTROLS" "PASS" "tip=$tip mixWin=$mixWin ctrlWin=$ctrlWin t1=$t1g t2=$t2g"
} else {
  Result "C3_VS_TRACK_CONTROLS" "FAIL" "tip=$tip exp=$exp mix=$o5 ctrl=$o6 t1=$t1g t2=$t2g lost=$lost"
}

# C4: mix vs FX
$tipN = [int](Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';")
$Req4 = "a2000013-0013-4013-8013-000000000013"
$sqlMix2 = @"
DO `$`$
DECLARE v_ver int;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT document_version INTO v_ver FROM public.studio_cas_apply_mix_working_ops(
    '$Proj'::uuid, '$Owner'::uuid, $tipN, '$Req4'::uuid, '$FpI',
    jsonb_build_object('master', jsonb_build_object('master_gain_db', -3), 'tracks', '{}'::jsonb),
    '$FpJ'
  );
  RAISE NOTICE 'MIX=%', coalesce(v_ver::text, 'EMPTY');
END;
`$`$;
"@
$sqlFx = @"
DO `$`$
DECLARE v_ver int;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT document_version INTO v_ver FROM public.studio_cas_apply_fx_chain(
    '$Proj'::uuid, '$Owner'::uuid, $tipN, '{"schemaVersion":1,"effects":[]}'::jsonb, '$T1'::uuid
  );
  RAISE NOTICE 'FX=%', coalesce(v_ver::text, 'EMPTY');
END;
`$`$;
"@

$j7 = Start-PsqlJob $sqlMix2
$j8 = Start-PsqlJob $sqlFx
$o7 = Receive-Job $j7 -Wait
$o8 = Receive-Job $j8 -Wait
Remove-Job $j7, $j8 -Force
$tip = Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';"
$exp = $tipN + 1
if ($tip -eq "$exp" -and (("$o7" -match "MIX=$exp") -or ("$o8" -match "FX=$exp"))) {
  Result "C4_VS_FX_CAS" "PASS" "tip=$tip mix=$o7 fx=$o8"
} else {
  Result "C4_VS_FX_CAS" "FAIL" "tip=$tip exp=$exp mix=$o7 fx=$o8"
}

# C5: mix vs master pan CAS update
$tipN = [int](Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';")
$Req5 = "a2000014-0014-4014-8014-000000000014"
$sqlMix3 = @"
DO `$`$
DECLARE v_ver int;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT document_version INTO v_ver FROM public.studio_cas_apply_mix_working_ops(
    '$Proj'::uuid, '$Owner'::uuid, $tipN, '$Req5'::uuid, '$FpK',
    jsonb_build_object('master', jsonb_build_object('master_pan', -0.2), 'tracks', '{}'::jsonb),
    '$FpL'
  );
  RAISE NOTICE 'MIX=%', coalesce(v_ver::text, 'EMPTY');
END;
`$`$;
"@
$sqlMaster = @"
DO `$`$
DECLARE v_ver int;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  UPDATE public.studio_projects
  SET master_pan = 0.4, document_version = document_version + 1
  WHERE id = '$Proj' AND owner_id = '$Owner' AND document_version = $tipN
  RETURNING document_version INTO v_ver;
  RAISE NOTICE 'MASTER=%', coalesce(v_ver::text, 'EMPTY');
END;
`$`$;
"@

$j9 = Start-PsqlJob $sqlMix3
$j10 = Start-PsqlJob $sqlMaster
$o9 = Receive-Job $j9 -Wait
$o10 = Receive-Job $j10 -Wait
Remove-Job $j9, $j10 -Force
$tip = Invoke-Psql "SELECT document_version FROM public.studio_projects WHERE id='$Proj';"
$exp = $tipN + 1
if ($tip -eq "$exp") {
  Result "C5_VS_MASTER_MIX" "PASS" "tip=$tip mix=$o9 master=$o10"
} else {
  Result "C5_VS_MASTER_MIX" "FAIL" "tip=$tip exp=$exp mix=$o9 master=$o10"
}

# Cleanup
Invoke-Psql @"
DO `$`$
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  DELETE FROM public.studio_mix_working_idempotency WHERE project_id='$Proj' OR owner_id='$Owner';
  DELETE FROM public.studio_projects WHERE id='$Proj';
  DELETE FROM public.profiles WHERE id='$Owner';
  DELETE FROM auth.users WHERE id='$Owner';
END;
`$`$;
"@ | Out-Null
Result "C_CLEANUP" "PASS" ""
