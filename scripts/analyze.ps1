#Requires -Version 5.1
<#
.SYNOPSIS
  레거시(Java+JSP+MyBatis+Oracle) 정적 인벤토리 + 미참조(죽은) 파일 탐지기.
  ※ 소스 코드만 읽는다. 빌드(mvn/ant/gradle) 실행 없음, 네트워크 접근 없음, jar 바이너리 해제 없음.
.DESCRIPTION
  git 없이 동작. 파일 참조 그래프를 만들어 진입점(web.xml/설정/JSP)에서 도달 불가한 파일을 찾는다.
  LLM 없이 100% 결정적으로 동작한다. LLM은 이 산출물 위에서 "판단"만 한다.
.EXAMPLE
  .\analyze.ps1 -Root "D:\legacy" -CommonPkg "com.company.common"
#>
[CmdletBinding()]
param(
  [string]   $Root      = ".",
  [string]   $Out       = "_analysis",
  [string]   $CommonPkg = "",
  [string]   $ServicePrefix = "",
  [string[]] $Exclude   = @('\\node_modules\\','\\target\\','\\build\\','\\bin\\','\\out\\','\\dist\\','\\.svn\\','\\.git\\','\\WEB-INF\\lib\\','\\backup','\\bak\\','\\_old')
)

$ErrorActionPreference = 'Stop'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$Root = (Resolve-Path $Root).Path
if (-not [System.IO.Path]::IsPathRooted($Out)) { $Out = Join-Path $Root $Out }
New-Item -ItemType Directory -Force -Path $Out | Out-Null

function Log($m) { Write-Host ("[{0,6:N1}s] {1}" -f $sw.Elapsed.TotalSeconds, $m) }

# ---------------------------------------------------------------- 인코딩 안전 읽기
$Utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
try { $Ansi = [System.Text.Encoding]::GetEncoding(949) } catch { $Ansi = [System.Text.Encoding]::Default }

function Read-Src([string]$p) {
  try { $b = [System.IO.File]::ReadAllBytes($p) } catch { return $null }
  if ($b.Length -eq 0) { return @{ Text = ''; Enc = 'EMPTY' } }
  if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) {
    return @{ Text = [System.Text.Encoding]::UTF8.GetString($b, 3, $b.Length - 3); Enc = 'UTF-8-BOM' }
  }
  try { return @{ Text = $Utf8Strict.GetString($b); Enc = 'UTF-8/ASCII' } } catch {}
  return @{ Text = $Ansi.GetString($b); Enc = 'MS949' }   # EUC-KR 계열
}

# ---------------------------------------------------------------- 정규식
$rePkg     = [regex]'(?m)^\s*package\s+([\w\.]+)\s*;'
$reImport  = [regex]'(?m)^\s*import\s+(?:static\s+)?([\w\.\*]+)\s*;'
$reType    = [regex]'(?m)^[\t ]*(?:public|protected|private)?[\t ]*(?:static[\t ]+|final[\t ]+|abstract[\t ]+)*(class|interface|enum)[\t ]+(\w+)'
$rePubM    = [regex]'(?m)^[\t ]*public[\t ]+(?:static[\t ]+|final[\t ]+|synchronized[\t ]+|abstract[\t ]+|native[\t ]+)*([\w\.\<\>\[\],\? ]+?)[\t ]+(\w+)[\t ]*\(([^\)]*)\)'
$reStr     = [regex]'"((?:[^"\\\r\n]|\\.){1,400})"'
$reCap     = [regex]'\b[A-Z][A-Za-z0-9_]{1,}\b'
$reCmtBlk  = [regex]'(?s)/\*.*?\*/'
$reCmtLn   = [regex]'(?m)//[^\r\n]*'
$reMain    = [regex]'static\s+(?:public\s+)?void\s+main\s*\(\s*(?:final\s+)?String'
$reDbCall  = [regex]'\.(queryForObject|queryForList|queryForMap|selectOne|selectList|selectMap|insert|update|delete)\s*\('
$reSess    = [regex]'(?:set|get)Attribute\s*\(\s*"([^"]{1,120})"'
$reTx      = [regex]'(setAutoCommit|\.commit\s*\(\s*\)|\.rollback\s*\(\s*\)|@Transactional|UserTransaction)'
$reFwd     = [regex]'(?i)([\w/\.\-]+\.jsp)'
$reStmt    = [regex]'(?is)<(select|insert|update|delete|procedure|statement)\s[^>]*?\bid\s*=\s*"([^"]+)"'
$reNs      = [regex]'(?is)<(?:sqlMap|mapper)\b[^>]*?\bnamespace\s*=\s*"([^"]+)"'
$reTbl     = [regex]'(?is)\b(?:from|join|into|update)\s+([A-Za-z_][A-Za-z0-9_]{1,60})'
$reDyn     = [regex]'(?i)<(if|choose|when|otherwise|foreach|trim|where|set|isNotEmpty|isEqual|isNull|dynamic)\b'
$reXmlCls  = [regex]'(?is)(?:<(?:servlet-class|filter-class|listener-class|value)>\s*([\w\.$]+)\s*</|(?:\btype|\bclass)\s*=\s*"([\w\.$]+)")'
$reWelcome = [regex]'(?is)<welcome-file>\s*([^<]+?)\s*</welcome-file>'
$reUrlPat  = [regex]'(?is)<url-pattern>\s*([^<]+?)\s*</url-pattern>'
$reJspInc  = [regex]'(?is)(?:<%@\s*include\s+file\s*=\s*"([^"]+)"|<jsp:include\s+page\s*=\s*"([^"]+)"|<c:import\s+url\s*=\s*"([^"]+)")'
$reJspTag  = [regex]'(?is)<%@\s*taglib\s+[^%]*?uri\s*=\s*"([^"]+)"'
$reForm    = [regex]'(?is)<form\b[^>]*?action\s*=\s*"([^"]*)"'
$reAjax    = [regex]'(?is)(?:\$\.(?:ajax|get|post|getJSON)\s*\(|\burl\s*:\s*)[\s\(]*[''"]([^''"]{1,200})[''"]'
$reScript  = [regex]'(?is)<script\b[^>]*?src\s*=\s*"([^"]+)"'
$reScrlt   = [regex]'(?s)<%(?![@\-=])(.*?)%>'
$reJsImp   = [regex]'(?is)(?:import\s+[^;]*?from\s*[''"]([^''"]+)[''"]|require\s*\(\s*[''"]([^''"]+)[''"])'

$reJspImport= [regex]'(?is)<%@\s*page\b[^%]*?\bimport\s*=\s*"([^"]+)"'
$reNewCls   = [regex]'\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\('
$reStatCls  = [regex]'\b([A-Z][A-Za-z0-9_]{2,})\s*\.\s*[a-z][A-Za-z0-9_]*\s*\('

$OracleSyntax = @(
  @{n='ROWNUM';       r=[regex]'(?i)\bROWNUM\b';            risk='중'; alt='OFFSET/FETCH 또는 RowBounds'},
  @{n='CONNECT BY';   r=[regex]'(?i)\bCONNECT\s+BY\b';      risk='상'; alt='재귀 CTE 또는 앱 레벨 트리 구성'},
  @{n='START WITH';   r=[regex]'(?i)\bSTART\s+WITH\b';      risk='상'; alt='재귀 CTE'},
  @{n='OUTER JOIN(+)';r=[regex]'\(\s*\+\s*\)';              risk='중'; alt='ANSI LEFT/RIGHT OUTER JOIN'},
  @{n='DECODE';       r=[regex]'(?i)\bDECODE\s*\(';         risk='하'; alt='CASE WHEN'},
  @{n='NVL';          r=[regex]'(?i)\bNVL2?\s*\(';          risk='하'; alt='COALESCE'},
  @{n='DUAL';         r=[regex]'(?i)\bFROM\s+DUAL\b';       risk='하'; alt='FROM 절 제거'},
  @{n='SEQUENCE';     r=[regex]'(?i)\.\s*NEXTVAL\b';        risk='중'; alt='시퀀스 유지 또는 IDENTITY'},
  @{n='MERGE INTO';   r=[regex]'(?i)\bMERGE\s+INTO\b';      risk='중'; alt='UPSERT 문법 확인'},
  @{n='LISTAGG';      r=[regex]'(?i)\b(LISTAGG|WM_CONCAT)\s*\('; risk='중'; alt='GROUP_CONCAT/STRING_AGG'},
  @{n='TO_CHAR/DATE'; r=[regex]'(?i)\bTO_(CHAR|DATE)\s*\('; risk='하'; alt='표준 날짜 함수'},
  @{n='분석함수';      r=[regex]'(?i)\b(ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD)\s*\(\s*\)?\s*OVER'; risk='중'; alt='표준 윈도우 함수(대부분 호환)'},
  @{n='MINUS';        r=[regex]'(?i)\bMINUS\b';             risk='하'; alt='EXCEPT'},
  @{n='HINT';         r=[regex]'/\*\+';                     risk='중'; alt='실행계획 재검토'},
  @{n='PROCEDURE호출'; r=[regex]'(?i)(\{\s*call\b|prepareCall|CallableStatement|<procedure)'; risk='상'; alt='Java 로직 이전 또는 프로시저 유지'}
)

$RiskUi = @(
  @{n='ActiveX/OBJECT'; r=[regex]'(?i)(classid\s*=|new\s+ActiveXObject|<object\b)'},
  @{n='showModalDialog';r=[regex]'(?i)showModalDialog'},
  @{n='document.all';   r=[regex]'(?i)document\.all\b'},
  @{n='attachEvent';    r=[regex]'(?i)\b(attachEvent|detachEvent)\b'},
  @{n='IE전용';         r=[regex]'(?i)(execCommand|\.selection\b|VBScript|window\.event\b)'},
  @{n='프레임셋';       r=[regex]'(?i)<frameset\b'},
  @{n='리포팅툴';       r=[regex]'(?i)(ozreport|crystal|jasper|ireport|ubireport|clipreport)'},
  @{n='엑셀생성';       r=[regex]'(?i)(HSSFWorkbook|XSSFWorkbook|jxl\.|application/vnd\.ms-excel)'},
  @{n='공인인증서';     r=[regex]'(?i)(npki|gpki|signcert|xecure|initech|crosscert)'}
)

# ---------------------------------------------------------------- 빌드파일 파싱용
$reDepBlk  = [regex]'(?is)<dependency>(.*?)</dependency>'
$reTagG    = [regex]'(?is)<groupId>\s*([^<]+?)\s*</groupId>'
$reTagA    = [regex]'(?is)<artifactId>\s*([^<]+?)\s*</artifactId>'
$reTagV    = [regex]'(?is)<version>\s*([^<]+?)\s*</version>'
$reTagS    = [regex]'(?is)<scope>\s*([^<]+?)\s*</scope>'
$reTagPkg  = [regex]'(?is)<packaging>\s*([^<]+?)\s*</packaging>'
$reModule  = [regex]'(?is)<module>\s*([^<]+?)\s*</module>'
$rePropBlk = [regex]'(?is)<properties>(.*?)</properties>'
$rePropOne = [regex]'(?is)<([\w\.\-]+)>\s*([^<]*?)\s*</\1>'
$reVarRef  = [regex]'\$\{([^\}]+)\}'
$reJarRef  = [regex]'(?i)([\w\.\-]+\.jar)'
$reSrcDir  = [regex]'(?is)<javac\b[^>]*?srcdir\s*=\s*"([^"]+)"'

# Java 21 / Spring Boot 3 이행 시 문제되는 라이브러리 (소스/선언만으로 판정)
$LibRisk = @(
  @{ r=[regex]'(?i)(^|[\.\-])struts';                risk='상'; alt='Spring MVC 로 대체. Action 클래스 직접 포팅 불가' },
  @{ r=[regex]'(?i)(^|[\.\-])log4j($|[\.\-])(?!.*2\.)'; risk='상'; alt='Log4j 1.x EOL/CVE → SLF4J + Logback' },
  @{ r=[regex]'(?i)javax\.servlet|servlet-api|jsp-api|jstl|javax\.el'; risk='상'; alt='jakarta.* 로 패키지 전면 변경 (Spring Boot 3 필수)' },
  @{ r=[regex]'(?i)(^|[\.\-])(ibatis|sqlmap)';       risk='상'; alt='MyBatis 3 (mybatis-spring-boot-starter)' },
  @{ r=[regex]'(?i)springframework';                 risk='상'; alt='Spring 2.x/3.x → Spring Boot 3.x. XML 설정 전면 재작성' },
  @{ r=[regex]'(?i)(ojdbc14|ojdbc5|ojdbc6|classes12|nls_charset)'; risk='상'; alt='ojdbc11 (Java 21 호환 드라이버)' },
  @{ r=[regex]'(?i)(^|[\.\-])(cglib|asm)($|[\.\-])'; risk='상'; alt='Java 21 바이트코드 미호환 가능성 큼. 제거 또는 최신화' },
  @{ r=[regex]'(?i)(javax\.xml\.bind|jaxb|javax\.annotation|javax\.persistence)'; risk='상'; alt='jakarta.* 로 변경' },
  @{ r=[regex]'(?i)commons-lang($|[^3])';            risk='중'; alt='commons-lang3' },
  @{ r=[regex]'(?i)commons-collections($|[^4])';     risk='중'; alt='commons-collections4 (역직렬화 CVE)' },
  @{ r=[regex]'(?i)commons-httpclient|httpclient';   risk='중'; alt='java.net.http.HttpClient (JDK 내장)' },
  @{ r=[regex]'(?i)commons-fileupload';              risk='중'; alt='Spring Multipart' },
  @{ r=[regex]'(?i)commons-logging';                 risk='중'; alt='jcl-over-slf4j' },
  @{ r=[regex]'(?i)(xerces|xalan|xml-apis)';         risk='중'; alt='JDK 내장 XML 파서. 제거 검토' },
  @{ r=[regex]'(?i)(^|[\.\-])dom4j';                 risk='중'; alt='CVE. JDK XML 또는 최신 dom4j' },
  @{ r=[regex]'(?i)json-lib|org\.json';              risk='중'; alt='Jackson' },
  @{ r=[regex]'(?i)(^|[\.\-])quartz';                risk='중'; alt='Spring @Scheduled 또는 Quartz 2.x' },
  @{ r=[regex]'(?i)(^|[\.\-])poi($|[\.\-])';         risk='중'; alt='poi 5.x (HSSF/XSSF API 변경)' },
  @{ r=[regex]'(?i)(velocity|freemarker|sitemesh|tiles)'; risk='중'; alt='화면은 React로 대체. 서버 템플릿 제거' },
  @{ r=[regex]'(?i)(^|[\.\-])junit($|[\.\-])';       risk='하'; alt='JUnit 5' },
  @{ r=[regex]'(?i)(jquery|prototype|scriptaculous|dwr)'; risk='하'; alt='React + fetch/axios' }
)
function Get-LibRisk([string]$name) {
  foreach ($k in $LibRisk) { if ($k.r.IsMatch($name)) { return @{ Risk=$k.risk; Alt=$k.alt } } }
  return @{ Risk=''; Alt='' }
}

# ---------------------------------------------------------------- 1) 파일 수집
Log "파일 수집 중: $Root"
$exts = @('.java','.jsp','.jspf','.jspx','.js','.xml','.tld','.properties','.sql','.html','.htm','.ftl','.vm','.classpath','.gradle')
$excludeRe = $null
if ($Exclude -and $Exclude.Count -gt 0) { $excludeRe = [regex]("(?i)(" + ($Exclude -join '|') + ")") }

$files = New-Object System.Collections.Generic.List[object]
Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
  $e = $_.Extension.ToLower()
  if ($exts -notcontains $e) { return }
  if ($excludeRe -and $excludeRe.IsMatch($_.FullName)) { return }
  $files.Add($_)
}
Log ("대상 파일 {0}개" -f $files.Count)
if ($files.Count -eq 0) { Write-Warning "대상 파일 없음. -Root 경로 확인."; return }

# ---------------------------------------------------------------- 2) 파싱 (파일당 1회 읽기)
$docs      = @{}                                                        # rel -> 파싱 결과
$typeIndex = @{}                                                        # simpleName -> [rel,...]
$allStrings= New-Object 'System.Collections.Generic.HashSet[string]'    # 전 파일 문자열 리터럴
$jspRefNames = New-Object 'System.Collections.Generic.HashSet[string]'  # 어딘가에서 언급된 jsp 파일명
$jsRefNames  = New-Object 'System.Collections.Generic.HashSet[string]'
$rootTypeNames = New-Object 'System.Collections.Generic.HashSet[string]' # 설정/JSP에서 지목된 클래스명
$modules = New-Object System.Collections.Generic.List[object]           # 빌드 모듈
$deps    = New-Object System.Collections.Generic.List[object]           # 선언된 의존성

$i = 0
foreach ($f in $files) {
  $i++
  if ($i % 2000 -eq 0) { Log ("파싱 {0}/{1}" -f $i, $files.Count) }
  $rel = $f.FullName.Substring($Root.Length).TrimStart('\','/')
  $src = Read-Src $f.FullName
  if ($null -eq $src) { continue }
  $t   = $src.Text
  $ext = $f.Extension.ToLower().TrimStart('.')
  $loc = ([regex]::Matches($t, "`n")).Count + 1

  $d = @{
    Rel=$rel; Name=$f.Name; Ext=$ext; Enc=$src.Enc; Loc=$loc; Bytes=$f.Length
    Pkg=''; Types=@(); Imports=@(); Refs=$null; Strings=@()
    Includes=@(); Statements=@(); Namespace=''; Tables=@(); Oracle=@(); Risks=@()
    Forms=@(); Ajax=@(); Scripts=@(); Taglibs=@(); Scriptlet=0; DbCalls=0; SessKeys=@(); Tx=@()
    IsRoot=$false; Kind=''
  }

  # 문자열 리터럴(주석 제거 전에 추출)
  $lits = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($m in $reStr.Matches($t)) { [void]$lits.Add($m.Groups[1].Value) }
  $d.Strings = @($lits)
  foreach ($s in $lits) { [void]$allStrings.Add($s) }

  # jsp / js 참조명 수집 (모든 파일 종류에서)
  foreach ($m in $reFwd.Matches($t)) { [void]$jspRefNames.Add(([System.IO.Path]::GetFileName($m.Groups[1].Value)).ToLower()) }
  foreach ($m in $reScript.Matches($t)) { [void]$jsRefNames.Add(([System.IO.Path]::GetFileName($m.Groups[1].Value)).ToLower()) }

  switch ($ext) {
    'java' {
      $d.Kind = 'java'
      $mp = $rePkg.Match($t); if ($mp.Success) { $d.Pkg = $mp.Groups[1].Value }
      $d.Imports = @($reImport.Matches($t) | ForEach-Object { $_.Groups[1].Value })
      $tp = @()
      foreach ($m in $reType.Matches($t)) { $tp += $m.Groups[2].Value }
      $d.Types = @($tp | Select-Object -Unique)
      foreach ($n in $d.Types) {
        if (-not $typeIndex.ContainsKey($n)) { $typeIndex[$n] = New-Object System.Collections.Generic.List[string] }
        $typeIndex[$n].Add($rel)
      }
      $body = $reCmtLn.Replace($reCmtBlk.Replace($t, ' '), ' ')
      $refs = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($m in $reCap.Matches($body)) { [void]$refs.Add($m.Value) }
      foreach ($imp in $d.Imports) { [void]$refs.Add(($imp -split '\.')[-1]) }
      $d.Refs = $refs
      $d.DbCalls = $reDbCall.Matches($t).Count
      $d.SessKeys = @($reSess.Matches($t) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
      $d.Tx = @($reTx.Matches($t) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
      if ($reMain.IsMatch($t)) { $d.IsRoot = $true }
    }
    { $_ -in @('jsp','jspf','jspx','html','htm') } {
      $d.Kind = 'view'
      $inc = @()
      foreach ($m in $reJspInc.Matches($t)) {
        $v = $m.Groups[1].Value; if (-not $v) { $v = $m.Groups[2].Value }; if (-not $v) { $v = $m.Groups[3].Value }
        if ($v) { $inc += $v }
      }
      $d.Includes = @($inc | Select-Object -Unique)
      $d.Taglibs  = @($reJspTag.Matches($t) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
      $d.Forms    = @($reForm.Matches($t)  | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
      $d.Ajax     = @($reAjax.Matches($t)  | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
      $d.Scripts  = @($reScript.Matches($t)| ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
      $n = 0
      foreach ($m in $reScrlt.Matches($t)) { $n += ([regex]::Matches($m.Groups[1].Value, "`n")).Count + 1 }
      $d.Scriptlet = $n
      $d.DbCalls = $reDbCall.Matches($t).Count
      foreach ($rk in $RiskUi) { if ($rk.r.IsMatch($t)) { $d.Risks += $rk.n } }
      # JSP 안에서 지목된 클래스명 = 살아있는 진입점 근거 (과탐 방지: 실제 참조 패턴만)
      foreach ($m in $reJspImport.Matches($t)) {
        foreach ($one in ($m.Groups[1].Value -split ',')) {
          $one = $one.Trim()
          if ($one -and -not $one.EndsWith('*')) { [void]$rootTypeNames.Add(($one -split '\.')[-1]) }
        }
      }
      foreach ($m in $reNewCls.Matches($t))  { [void]$rootTypeNames.Add($m.Groups[1].Value) }
      foreach ($m in $reStatCls.Matches($t)) { [void]$rootTypeNames.Add($m.Groups[1].Value) }
    }
    'js' {
      $d.Kind = 'js'
      $imp = @()
      foreach ($m in $reJsImp.Matches($t)) {
        $v = $m.Groups[1].Value; if (-not $v) { $v = $m.Groups[2].Value }
        if ($v) { $imp += $v }
      }
      $d.Includes = @($imp | Select-Object -Unique)
      $d.Ajax = @($reAjax.Matches($t) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
      foreach ($rk in $RiskUi) { if ($rk.r.IsMatch($t)) { $d.Risks += $rk.n } }
    }
    { $_ -in @('xml','tld','properties','sql','classpath','gradle') } {
      $d.Kind = 'config'
      # --- 빌드 파일: 선언만 읽는다. 빌드 실행/네트워크 접근 없음 ---
      $bn = $f.Name.ToLower()
      if ($bn -in @('pom.xml','build.xml','build.gradle','.classpath')) {
        $d.Kind = 'build'
        $modDir = Split-Path $rel -Parent
        if ($bn -eq 'pom.xml') {
          $props = @{}
          $pb = $rePropBlk.Match($t)
          if ($pb.Success) { foreach ($m in $rePropOne.Matches($pb.Groups[1].Value)) { $props[$m.Groups[1].Value] = $m.Groups[2].Value } }
          $head = $t
          foreach ($cut in @('(?is)<dependencies>.*?</dependencies>','(?is)<build>.*?</build>','(?is)<profiles>.*?</profiles>','(?is)<parent>.*?</parent>','(?is)<dependencyManagement>.*?</dependencyManagement>')) {
            $head = [regex]::Replace($head, $cut, ' ')
          }
          $selfA = ''; $selfV = ''; $selfP = 'jar'; $parent = ''
          $ma = $reTagA.Match($head); if ($ma.Success) { $selfA = $ma.Groups[1].Value }
          $mv = $reTagV.Match($head); if ($mv.Success) { $selfV = $mv.Groups[1].Value }
          $mk = $reTagPkg.Match($head); if ($mk.Success) { $selfP = $mk.Groups[1].Value }
          $pp = [regex]::Match($t, '(?is)<parent>(.*?)</parent>')
          if ($pp.Success) {
            $pa = $reTagA.Match($pp.Groups[1].Value)
            if ($pa.Success) { $parent = $pa.Groups[1].Value }
          }
          $subs = @($reModule.Matches($t) | ForEach-Object { $_.Groups[1].Value })
          $modules.Add([pscustomobject]@{
            모듈경로=$modDir; 빌드파일=$rel; 빌드도구='maven'; artifactId=$selfA
            version=$selfV; packaging=$selfP; parent=$parent; 하위모듈=($subs -join ' | ')
          })
          foreach ($m in $reDepBlk.Matches($t)) {
            $inner = $m.Groups[1].Value
            $g = ''; $a = ''; $v = ''; $sc = 'compile'
            $x = $reTagG.Match($inner); if ($x.Success) { $g = $x.Groups[1].Value }
            $x = $reTagA.Match($inner); if ($x.Success) { $a = $x.Groups[1].Value }
            $x = $reTagV.Match($inner); if ($x.Success) { $v = $x.Groups[1].Value }
            $x = $reTagS.Match($inner); if ($x.Success) { $sc = $x.Groups[1].Value }
            if (-not $a) { continue }
            $note = ''
            $vr = $reVarRef.Match($v)
            if ($vr.Success) {
              $k = $vr.Groups[1].Value
              if ($props.ContainsKey($k)) { $v = $props[$k] }
              else { $note = "버전이 상위 pom property(`${$k}`)에 있음 → UNKNOWN"; $v = 'UNKNOWN' }
            }
            if (-not $v) { $v = 'UNKNOWN'; $note = '버전 미기재(부모 dependencyManagement 상속) → UNKNOWN' }
            $rk = Get-LibRisk ($g + ':' + $a)
            $deps.Add([pscustomobject]@{
              모듈경로=$modDir; 빌드파일=$rel; 종류='maven'; groupId=$g; artifactId=$a
              version=$v; scope=$sc; 호환성위험=$rk.Risk; 대체방안=$rk.Alt; 비고=$note
            })
          }
        }
        else {
          # ant build.xml / eclipse .classpath / gradle : jar 파일명 선언만 수집
          $kind = 'ant'
          if ($bn -eq '.classpath') { $kind = 'eclipse' }
          if ($bn -eq 'build.gradle') { $kind = 'gradle' }
          $jars = @($reJarRef.Matches($t) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
          $srcs = @($reSrcDir.Matches($t) | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
          $modules.Add([pscustomobject]@{
            모듈경로=$modDir; 빌드파일=$rel; 빌드도구=$kind; artifactId=''
            version=''; packaging=''; parent=''; 하위모듈=($srcs -join ' | ')
          })
          foreach ($j in $jars) {
            $rk = Get-LibRisk $j
            $deps.Add([pscustomobject]@{
              모듈경로=$modDir; 빌드파일=$rel; 종류=$kind; groupId=''; artifactId=$j
              version='UNKNOWN'; scope=''; 호환성위험=$rk.Risk; 대체방안=$rk.Alt
              비고='jar 파일명 선언만 확인. 버전은 파일명에서 육안 확인 필요'
            })
          }
        }
      }
      # MyBatis / iBATIS
      $mn = $reNs.Match($t); if ($mn.Success) { $d.Namespace = $mn.Groups[1].Value }
      $st = New-Object System.Collections.Generic.List[object]
      foreach ($m in $reStmt.Matches($t)) {
        $line = ($t.Substring(0, $m.Index) -split "`n").Count
        $st.Add(@{ Type=$m.Groups[1].Value.ToLower(); Id=$m.Groups[2].Value; Line=$line })
      }
      $d.Statements = @($st)
      if ($st.Count -gt 0) {
        $d.Kind = 'mapper'
        $tb = @()
        foreach ($m in $reTbl.Matches($t)) {
          $v = $m.Groups[1].Value.ToUpper()
          if ($v -notin @('SELECT','WHERE','AND','OR','SET','VALUES','DUAL','TABLE')) { $tb += $v }
        }
        $d.Tables = @($tb | Select-Object -Unique)
        $d.Scriptlet = $reDyn.Matches($t).Count   # 동적 SQL 태그 수로 재사용
      }
      # 설정에서 지목된 클래스 = BFS 루트
      foreach ($m in $reXmlCls.Matches($t)) {
        $v = $m.Groups[1].Value; if (-not $v) { $v = $m.Groups[2].Value }
        if ($v -and $v -match '\.') { [void]$rootTypeNames.Add(($v -split '\.')[-1]) }
        elseif ($v -and $v -match '^[A-Z]') { [void]$rootTypeNames.Add($v) }
      }
      if ($f.Name -ieq 'web.xml') {
        $d.Kind = 'web.xml'
        $d.Forms = @($reUrlPat.Matches($t) | ForEach-Object { $_.Groups[1].Value })
        foreach ($m in $reWelcome.Matches($t)) { [void]$jspRefNames.Add(([System.IO.Path]::GetFileName($m.Groups[1].Value)).ToLower()) }
      }
    }
  }

  # Oracle 문법 (mapper/java/sql 공통)
  if ($ext -in @('xml','sql','java')) {
    foreach ($o in $OracleSyntax) {
      $c = $o.r.Matches($t).Count
      if ($c -gt 0) { $d.Oracle += @{ Name=$o.n; Count=$c; Risk=$o.risk; Alt=$o.alt } }
    }
  }
  $docs[$rel] = $d
}
Log "파싱 완료"

# 문자열 리터럴에 등장하는 클래스명도 루트로 (리플렉션/설정문자열)
foreach ($s in $allStrings) {
  if ($s -match '^[\w]+(\.[\w]+)+$') { [void]$rootTypeNames.Add(($s -split '\.')[-1]) }
}

# ---------------------------------------------------------------- 2.5) 서드파티 사용 인덱스
Log "서드파티 import 인덱스 구성"
$internal = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($r in $docs.Keys) {
  $pk = $docs[$r].Pkg
  if ($pk) {
    $seg = $pk -split '\.'
    if ($seg.Count -ge 2) { [void]$internal.Add(($seg[0] + '.' + $seg[1])) }
    else { [void]$internal.Add($pk) }
  }
}
$tpUse = @{}   # 패키지루트 -> @{Files=HashSet; Count=int}
foreach ($r in $docs.Keys) {
  if ($docs[$r].Kind -ne 'java') { continue }
  foreach ($imp in $docs[$r].Imports) {
    if ($imp -like 'java.*') { continue }                      # JDK 기본
    $seg = $imp -split '\.'
    if ($seg.Count -lt 2) { continue }
    $p2 = $seg[0] + '.' + $seg[1]
    if ($internal.Contains($p2)) { continue }                  # 우리 소스
    $root = $p2
    if ($seg.Count -ge 3) { $root = $p2 + '.' + $seg[2] }
    if (-not $tpUse.ContainsKey($root)) { $tpUse[$root] = @{ Files = (New-Object 'System.Collections.Generic.HashSet[string]'); Count = 0 } }
    [void]$tpUse[$root].Files.Add($r)
    $tpUse[$root].Count++
  }
}
Log ("서드파티 패키지 루트 {0}종" -f $tpUse.Count)

# 토큰 기반 느슨한 매칭 (선언 artifactId <-> import 패키지)
$generic = @('org','com','net','io','java','javax','api','core','all','lib','jar','impl','util','utils','client','runtime','spring','apache')
function Get-Tok([string]$x) {
  $out = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($t in ($x.ToLower() -split '[\.\-_:]')) {
    if ($t -and $t.Length -ge 3 -and $generic -notcontains $t -and $t -notmatch '^\d') { [void]$out.Add($t) }
  }
  return $out
}
$depTok = @{}
foreach ($dp in $deps) { $depTok[$dp.artifactId] = Get-Tok $dp.artifactId }
$useTok = @{}
foreach ($k in $tpUse.Keys) { $useTok[$k] = Get-Tok $k }

$cross = New-Object System.Collections.Generic.List[object]
foreach ($dp in ($deps | Sort-Object artifactId -Unique)) {
  $hit = ''
  foreach ($k in $useTok.Keys) {
    foreach ($t in $useTok[$k]) { if ($depTok[$dp.artifactId].Contains($t)) { $hit = $k; break } }
    if ($hit) { break }
  }
  $st = '사용만(선언없음)'
  if ($hit) { $st = '일치' } else { $st = '선언만(미사용 추정)' }
  $cross.Add([pscustomobject]@{
    상태=$st; artifactId=$dp.artifactId; groupId=$dp.groupId; version=$dp.version
    매칭패키지=$hit; 모듈경로=$dp.모듈경로; 호환성위험=$dp.호환성위험; 대체방안=$dp.대체방안
    조치='선언만이면 제거 후보. 단 리플렉션/런타임 전용(JDBC 드라이버 등)은 정상'
  })
}
foreach ($k in ($useTok.Keys | Sort-Object)) {
  $hit = ''
  foreach ($a in $depTok.Keys) {
    foreach ($t in $depTok[$a]) { if ($useTok[$k].Contains($t)) { $hit = $a; break } }
    if ($hit) { break }
  }
  if (-not $hit) {
    $rk = Get-LibRisk $k
    $cross.Add([pscustomobject]@{
      상태='사용만(선언없음)'; artifactId=''; groupId=''; version='UNKNOWN'
      매칭패키지=$k; 모듈경로=''; 호환성위험=$rk.Risk; 대체방안=$rk.Alt
      조치='WEB-INF/lib 에 jar 직접 투입 추정. 빌드 재구성 시 누락 위험 → 실물 jar 파일명 확인 필요'
    })
  }
}

# ---------------------------------------------------------------- 3) Java 도달성 분석
Log "Java 참조 그래프 구성"
$javaRels = @($docs.Keys | Where-Object { $docs[$_].Kind -eq 'java' })
$roots = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($r in $javaRels) {
  $d = $docs[$r]
  if ($d.IsRoot) { [void]$roots.Add($r); continue }
  foreach ($tn in $d.Types) { if ($rootTypeNames.Contains($tn)) { [void]$roots.Add($r); break } }
}
Log ("진입점(루트) 클래스 파일 {0}개" -f $roots.Count)

$reached = New-Object 'System.Collections.Generic.HashSet[string]'
$queue = New-Object System.Collections.Generic.Queue[string]
foreach ($r in $roots) { if ($reached.Add($r)) { $queue.Enqueue($r) } }
while ($queue.Count -gt 0) {
  $cur = $queue.Dequeue()
  $refs = $docs[$cur].Refs
  if ($null -eq $refs) { continue }
  foreach ($name in $refs) {
    if (-not $typeIndex.ContainsKey($name)) { continue }
    foreach ($tgt in $typeIndex[$name]) {
      if ($reached.Add($tgt)) { $queue.Enqueue($tgt) }
    }
  }
}
Log ("도달 Java 파일 {0} / 전체 {1}" -f $reached.Count, $javaRels.Count)

# ---------------------------------------------------------------- 4) JSP 도달성 분석
Log "JSP 참조 그래프 구성"
$viewRels = @($docs.Keys | Where-Object { $docs[$_].Kind -eq 'view' })
$byName = @{}
foreach ($r in $viewRels) {
  $n = $docs[$r].Name.ToLower()
  if (-not $byName.ContainsKey($n)) { $byName[$n] = New-Object System.Collections.Generic.List[string] }
  $byName[$n].Add($r)
}
$vReached = New-Object 'System.Collections.Generic.HashSet[string]'
$vq = New-Object System.Collections.Generic.Queue[string]
foreach ($r in $viewRels) {
  if ($jspRefNames.Contains($docs[$r].Name.ToLower())) { if ($vReached.Add($r)) { $vq.Enqueue($r) } }
}
while ($vq.Count -gt 0) {
  $cur = $vq.Dequeue()
  foreach ($inc in $docs[$cur].Includes) {
    $n = ([System.IO.Path]::GetFileName($inc)).ToLower()
    if ($byName.ContainsKey($n)) {
      foreach ($tgt in $byName[$n]) { if ($vReached.Add($tgt)) { $vq.Enqueue($tgt) } }
    }
  }
}
Log ("도달 JSP {0} / 전체 {1}" -f $vReached.Count, $viewRels.Count)

# ---------------------------------------------------------------- 5) statement / js 도달성
$stmtAlive = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($s in $allStrings) { [void]$stmtAlive.Add($s) }

$jsRels = @($docs.Keys | Where-Object { $docs[$_].Kind -eq 'js' })

# ---------------------------------------------------------------- 5.5) 서비스 단위 슬라이스 (역추적)
$svcRows   = New-Object System.Collections.Generic.List[object]
$svcDep    = New-Object System.Collections.Generic.List[object]
$commonUse = @{}    # 외부파일 -> 그 파일을 쓰는 서비스 집합

if ($ServicePrefix) {
  Log "서비스 슬라이스 분석: $ServicePrefix*"
  $cands = New-Object System.Collections.Generic.List[string]
  Get-ChildItem -LiteralPath $Root -Recurse -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -like "$ServicePrefix*") {
      if ($excludeRe -and $excludeRe.IsMatch($_.FullName)) { return }
      $cands.Add($_.FullName.Substring($Root.Length).TrimStart('\','/'))
    }
  }
  # 중첩 폴더 제거 (최상위 것만 서비스로 본다)
  $svcs = New-Object System.Collections.Generic.List[string]
  foreach ($c in ($cands | Sort-Object { $_.Length })) {
    $nested = $false
    foreach ($pv in $svcs) { if ($c.StartsWith($pv + '\')) { $nested = $true; break } }
    if (-not $nested) { $svcs.Add($c) }
  }
  Log ("서비스 폴더 {0}개" -f $svcs.Count)

  foreach ($svc in $svcs) {
    $pre = $svc + '\'
    $inSvc = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($k in $docs.Keys) { if ($k.StartsWith($pre)) { [void]$inSvc.Add($k) } }
    if ($inSvc.Count -eq 0) { continue }

    # --- 이 서비스가 폴더 밖에서 끌어다 쓰는 것 전이 추적 ---
    $ext  = New-Object 'System.Collections.Generic.HashSet[string]'
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $q    = New-Object System.Collections.Generic.Queue[string]
    foreach ($k in $inSvc) { [void]$seen.Add($k); $q.Enqueue($k) }
    while ($q.Count -gt 0) {
      $cur = $q.Dequeue()
      $dd = $docs[$cur]
      if ($null -ne $dd.Refs) {
        foreach ($n in $dd.Refs) {
          if (-not $typeIndex.ContainsKey($n)) { continue }
          foreach ($t in $typeIndex[$n]) {
            if ($seen.Add($t)) { $q.Enqueue($t); if (-not $t.StartsWith($pre)) { [void]$ext.Add($t) } }
          }
        }
      }
      foreach ($inc in $dd.Includes) {
        $nm = ([System.IO.Path]::GetFileName($inc)).ToLower()
        if ($byName.ContainsKey($nm)) {
          foreach ($t in $byName[$nm]) {
            if ($seen.Add($t)) { $q.Enqueue($t); if (-not $t.StartsWith($pre)) { [void]$ext.Add($t) } }
          }
        }
      }
    }

    # --- 실행 형태 판정 ---
    $webxml = @($inSvc | Where-Object { $docs[$_].Kind -eq 'web.xml' })
    $hasMain = @($inSvc | Where-Object { $docs[$_].IsRoot -eq $true })
    $run = '라이브러리/모듈 (단독 실행 아님)'
    $urlPat = ''
    if ($webxml.Count -gt 0) {
      $run = 'WAR 독립 배포'
      $urlPat = ($docs[$webxml[0]].Forms -join ' | ')
    }
    elseif ($hasMain.Count -gt 0) { $run = '배치/단독 실행 (main 보유)' }
    elseif (@($inSvc | Where-Object { $docs[$_].Kind -eq 'view' }).Count -gt 0) { $run = '화면 보유 (상위 WAR에 포함 추정)' }

    $svcRows.Add([pscustomobject]@{
      서비스=$svc; 실행형태=$run
      web_xml=$(if ($webxml.Count -gt 0) { $webxml[0] } else { '' })
      URL패턴=$urlPat
      Java수=@($inSvc | Where-Object { $docs[$_].Kind -eq 'java' }).Count
      JSP수=@($inSvc | Where-Object { $docs[$_].Kind -eq 'view' }).Count
      Mapper수=@($inSvc | Where-Object { $docs[$_].Kind -eq 'mapper' }).Count
      전체파일수=$inSvc.Count
      외부의존파일수=$ext.Count
      main보유=$(if ($hasMain.Count -gt 0) { 'Y' } else { '' })
    })

    foreach ($e in $ext) {
      $ed = $docs[$e]
      $svcDep.Add([pscustomobject]@{
        서비스=$svc; 외부파일=$e; 종류=$ed.Kind; 패키지=$ed.Pkg
        타입=($ed.Types -join '|'); LOC=$ed.Loc
      })
      if (-not $commonUse.ContainsKey($e)) { $commonUse[$e] = New-Object 'System.Collections.Generic.HashSet[string]' }
      [void]$commonUse[$e].Add($svc)
    }
  }
  Log ("서비스-외부의존 엣지 {0}건 / 공통 후보 파일 {1}개" -f $svcDep.Count, $commonUse.Count)
}

# ---------------------------------------------------------------- 6) 산출물 기록
Log "CSV 기록"
function Csv($name, $rows) {
  $p = Join-Path $Out $name
  if ($null -eq $rows -or @($rows).Count -eq 0) { "" | Set-Content -LiteralPath $p -Encoding UTF8; return }
  $rows | Export-Csv -LiteralPath $p -NoTypeInformation -Encoding UTF8
}

# 00 파일/인코딩
Csv '00_files.csv' (@($docs.Keys | Sort-Object) | ForEach-Object {
  [pscustomobject]@{ 경로=$_; 종류=$docs[$_].Kind; 확장자=$docs[$_].Ext; 인코딩=$docs[$_].Enc; LOC=$docs[$_].Loc; 바이트=$docs[$_].Bytes }
})
Csv '00_encoding-summary.csv' (@($docs.Values | Group-Object { $_.Enc } | ForEach-Object {
  [pscustomobject]@{ 인코딩=$_.Name; 파일수=$_.Count }
}))

# 00 빌드 모듈 / 의존성 (선언만 읽음. 빌드 실행 없음)
Csv '00_modules.csv' (@($modules | Sort-Object 모듈경로) | ForEach-Object {
  $mo = $_
  $mp = $mo.모듈경로
  $pre = ''
  if ($mp) { $pre = $mp + '\' }
  $sc = @($docs.Keys | Where-Object { $_ -like "$pre*" })
  [pscustomobject]@{
    모듈경로=$mp; 빌드파일=$mo.빌드파일; 빌드도구=$mo.빌드도구; artifactId=$mo.artifactId
    version=$mo.version; packaging=$mo.packaging; parent=$mo.parent; 하위모듈=$mo.하위모듈
    Java수=@($sc | Where-Object { $docs[$_].Kind -eq 'java' }).Count
    JSP수=@($sc | Where-Object { $docs[$_].Kind -eq 'view' }).Count
    Mapper수=@($sc | Where-Object { $docs[$_].Kind -eq 'mapper' }).Count
  }
})
Csv '00_dependencies.csv' (@($deps | Sort-Object 호환성위험, artifactId))
Csv '00_dependency-crosscheck.csv' (@($cross | Sort-Object 상태, artifactId))
Csv '01_thirdparty-usage.csv' (@($tpUse.Keys | Sort-Object { -$tpUse[$_].Count }) | ForEach-Object {
  $pk = $_
  $rk = Get-LibRisk $pk
  [pscustomobject]@{
    패키지루트=$pk; 사용파일수=$tpUse[$pk].Files.Count; import건수=$tpUse[$pk].Count
    호환성위험=$rk.Risk; 대체방안=$rk.Alt
    대표사용파일=((@($tpUse[$pk].Files) | Select-Object -First 3) -join ' | ')
  }
})

# 02 배포단위
Csv '02_webapps.csv' (@($docs.Keys | Where-Object { $docs[$_].Kind -eq 'web.xml' } | ForEach-Object {
  $wx = $_
  $webRoot = Split-Path (Split-Path $wx -Parent) -Parent
  $prefix = if ($webRoot) { $webRoot + '\' } else { '' }
  $scope = @($docs.Keys | Where-Object { $_ -like "$prefix*" })
  [pscustomobject]@{
    web_xml=$wx; 배포루트=$webRoot
    JSP수=@($scope | Where-Object { $docs[$_].Kind -eq 'view' }).Count
    Java수=@($scope | Where-Object { $docs[$_].Kind -eq 'java' }).Count
    Mapper수=@($scope | Where-Object { $docs[$_].Kind -eq 'mapper' }).Count
    URL패턴=($docs[$wx].Forms -join ' | ')
  }
}))

# 03 JSP 인벤토리
Csv '03_jsp-inventory.csv' (@($viewRels | Sort-Object) | ForEach-Object {
  $d = $docs[$_]
  [pscustomobject]@{
    경로=$_; 파일명=$d.Name; 인코딩=$d.Enc; LOC=$d.Loc; 스크립틀릿라인=$d.Scriptlet
    JSP내DB호출=$d.DbCalls; include수=$d.Includes.Count; form수=$d.Forms.Count; ajax수=$d.Ajax.Count
    form_action=($d.Forms -join ' | '); ajax_url=($d.Ajax -join ' | ')
    taglib=($d.Taglibs -join ' | '); script=($d.Scripts -join ' | ')
    레거시위험=($d.Risks -join ' | ')
    도달여부=$(if ($vReached.Contains($_)) { 'ALIVE' } else { 'UNREACHED' })
  }
})

# 04 Java 클래스
Csv '04_java-classes.csv' (@($javaRels | Sort-Object) | ForEach-Object {
  $d = $docs[$_]
  [pscustomobject]@{
    경로=$_; 패키지=$d.Pkg; 타입=($d.Types -join ' | '); LOC=$d.Loc; 인코딩=$d.Enc
    import수=$d.Imports.Count; DB호출=$d.DbCalls
    세션키=($d.SessKeys -join ' | '); 트랜잭션=($d.Tx -join ' | ')
    진입점=$(if ($d.IsRoot -or $roots.Contains($_)) { 'Y' } else { '' })
    도달여부=$(if ($reached.Contains($_)) { 'ALIVE' } else { 'UNREACHED' })
  }
})

# 05 mapper statement
$stmtRows = New-Object System.Collections.Generic.List[object]
foreach ($r in @($docs.Keys | Where-Object { $docs[$_].Kind -eq 'mapper' } | Sort-Object)) {
  $d = $docs[$r]
  foreach ($s in $d.Statements) {
    $full = if ($d.Namespace) { $d.Namespace + '.' + $s.Id } else { $s.Id }
    $alive = $stmtAlive.Contains($full) -or $stmtAlive.Contains($s.Id)
    $stmtRows.Add([pscustomobject]@{
      경로=$r; 라인=$s.Line; namespace=$d.Namespace; statement_id=$s.Id; 전체id=$full; 종류=$s.Type
      참조테이블=($d.Tables -join ' | '); 동적SQL태그수=$d.Scriptlet
      도달여부=$(if ($alive) { 'ALIVE' } else { 'UNREACHED' })
    })
  }
}
Csv '05_mapper-statements.csv' $stmtRows

# 05 Oracle 종속
$oraRows = New-Object System.Collections.Generic.List[object]
foreach ($r in @($docs.Keys | Sort-Object)) {
  foreach ($o in $docs[$r].Oracle) {
    $oraRows.Add([pscustomobject]@{ 경로=$r; 문법=$o.Name; 출현수=$o.Count; 위험도=$o.Risk; 대체방안=$o.Alt })
  }
}
Csv '05_oracle-dependency.csv' $oraRows

# 09 죽은 코드 후보
Csv '09_dead-java.csv' (@($javaRels | Where-Object { -not $reached.Contains($_) } | Sort-Object) | ForEach-Object {
  [pscustomobject]@{ 경로=$_; 패키지=$docs[$_].Pkg; 타입=($docs[$_].Types -join ' | '); LOC=$docs[$_].Loc
                     사유='어떤 진입점에서도 참조 그래프상 도달 불가'; 확인필요='리플렉션/문자열 클래스로딩/외부 스크립트 호출 여부' }
})
Csv '09_dead-jsp.csv' (@($viewRels | Where-Object { -not $vReached.Contains($_) } | Sort-Object) | ForEach-Object {
  $d = $docs[$_]
  $sus = if ($d.Ext -eq 'jspf') { '조각(jspf)인데 아무도 include 안 함 → 삭제 후보 확실' } else { 'URL 직접 접근 가능성 있음 → 웹서버 액세스로그로 교차확인 필요' }
  [pscustomobject]@{ 경로=$_; LOC=$d.Loc; 확장자=$d.Ext; 사유='참조/include 그래프상 도달 불가'; 확인필요=$sus }
})
Csv '09_dead-js.csv' (@($jsRels | Where-Object { -not $jsRefNames.Contains($docs[$_].Name.ToLower()) } | Sort-Object) | ForEach-Object {
  [pscustomobject]@{ 경로=$_; LOC=$docs[$_].Loc; 사유='어떤 화면에서도 script src / import 로 참조되지 않음'; 확인필요='동적 로딩($.getScript, 문자열 조합 경로)' }
})
Csv '09_dead-statements.csv' (@($stmtRows | Where-Object { $_.도달여부 -eq 'UNREACHED' }))

# 10 서비스 슬라이스
if ($ServicePrefix) {
  Csv '10_services.csv' (@($svcRows | Sort-Object 서비스))
  Csv '10_service-deps.csv' (@($svcDep | Sort-Object 서비스, 외부파일))
  Csv '10_common-shared.csv' (@($commonUse.Keys | Sort-Object { -$commonUse[$_].Count }) | ForEach-Object {
    $ck = $_
    $n = $commonUse[$ck].Count
    $verdict = '해당 서비스 전용 → 그 서비스로 흡수'
    if ($n -ge 3) { $verdict = '진짜 공통 → platform-core 후보' }
    elseif ($n -eq 2) { $verdict = '2개 서비스 공유 → 복제 또는 공통화 판단 필요' }
    [pscustomobject]@{
      공통파일=$ck; 종류=$docs[$ck].Kind; 패키지=$docs[$ck].Pkg
      타입=($docs[$ck].Types -join '|'); LOC=$docs[$ck].Loc
      사용서비스수=$n; 사용서비스=((@($commonUse[$ck]) | Sort-Object) -join ' | '); 판정=$verdict
    }
  })
}

# 01 공통 모듈
if ($CommonPkg) {
  Log "공통 모듈 분석: $CommonPkg"
  $cPrefix = $CommonPkg.TrimEnd('.') + '.'
  $commonRels = @($javaRels | Where-Object { $docs[$_].Pkg -eq $CommonPkg.TrimEnd('.') -or $docs[$_].Pkg -like ($cPrefix + '*') })
  Log ("공통 모듈 Java 파일 {0}개" -f $commonRels.Count)

  $api = New-Object System.Collections.Generic.List[object]
  foreach ($r in $commonRels) {
    $src = Read-Src (Join-Path $Root $r); if ($null -eq $src) { continue }
    foreach ($m in $rePubM.Matches($src.Text)) {
      $rt = $m.Groups[1].Value.Trim(); $mn = $m.Groups[2].Value
      if ($mn -in @('if','for','while','switch','catch','synchronized','return','new')) { continue }
      $line = ($src.Text.Substring(0, $m.Index) -split "`n").Count
      $api.Add([pscustomobject]@{
        경로=$r; 라인=$line; 패키지=$docs[$r].Pkg; 클래스=($docs[$r].Types -join '|')
        반환타입=$rt; 메서드=$mn; 파라미터=$m.Groups[3].Value.Trim()
      })
    }
  }

  $commonSet = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($c in $commonRels) { [void]$commonSet.Add($c) }
  $consumerRels = @($javaRels | Where-Object { -not $commonSet.Contains($_) })
  $usage = New-Object System.Collections.Generic.List[object]
  $usedType = @{}
  $usedMethod = @{}
  foreach ($r in $consumerRels) {
    $d = $docs[$r]
    foreach ($imp in $d.Imports) {
      if ($imp -like ($cPrefix + '*')) {
        $sn = ($imp -split '\.')[-1]
        $usage.Add([pscustomobject]@{ 사용파일=$r; 사용패키지=$d.Pkg; 공통클래스=$imp; 방식='import' })
        $usedType[$sn] = $true
      }
    }
    if ($null -ne $d.Refs) { foreach ($n in $d.Refs) { if (-not $usedMethod.ContainsKey($n)) { $usedMethod[$n] = $true } } }
  }
  # JSP/설정에서의 사용도 반영
  foreach ($n in $rootTypeNames) { $usedType[$n] = $true; $usedMethod[$n] = $true }

  Csv '01_common-api-surface.csv' $api
  Csv '01_common-usage-index.csv' $usage
  Csv '01_common-dead-class.csv' (@($commonRels | Where-Object {
      $tn = $docs[$_].Types
      $hit = $false
      foreach ($n in $tn) { if ($usedType.ContainsKey($n) -or $usedMethod.ContainsKey($n)) { $hit = $true; break } }
      -not $hit
    } | Sort-Object) | ForEach-Object {
      [pscustomobject]@{ 경로=$_; 패키지=$docs[$_].Pkg; 클래스=($docs[$_].Types -join '|'); LOC=$docs[$_].Loc
                         사유='공통 모듈 외부에서 import/참조 흔적 없음'; 판정='포팅 제외 후보' }
  })
  Csv '01_common-method-unused.csv' (@($api | Where-Object { -not $usedMethod.ContainsKey($_.메서드) }))
}

# ---------------------------------------------------------------- 7) 요약
$sumPath = Join-Path $Out '99_summary.txt'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("분석 루트 : $Root")
$lines.Add("생성 시각 : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$lines.Add("소요 시간 : " + ("{0:N1}초" -f $sw.Elapsed.TotalSeconds))
$lines.Add("")
$lines.Add("[규모]")
$lines.Add(("  전체 파일      : {0}" -f $docs.Count))
$lines.Add(("  Java           : {0} (LOC {1})" -f $javaRels.Count, (($javaRels | ForEach-Object { $docs[$_].Loc } | Measure-Object -Sum).Sum)))
$lines.Add(("  JSP/화면       : {0} (LOC {1})" -f $viewRels.Count, (($viewRels | ForEach-Object { $docs[$_].Loc } | Measure-Object -Sum).Sum)))
$lines.Add(("  JS             : {0}" -f $jsRels.Count))
$lines.Add(("  Mapper 파일    : {0} / statement {1}" -f @($docs.Keys | Where-Object { $docs[$_].Kind -eq 'mapper' }).Count, $stmtRows.Count))
$lines.Add(("  배포단위(web.xml): {0}" -f @($docs.Keys | Where-Object { $docs[$_].Kind -eq 'web.xml' }).Count))
$lines.Add("")
$lines.Add("[미참조(죽은 코드) 후보]")
$dj = @($javaRels | Where-Object { -not $reached.Contains($_) }).Count
$dv = @($viewRels | Where-Object { -not $vReached.Contains($_) }).Count
$dsm = @($stmtRows | Where-Object { $_.도달여부 -eq 'UNREACHED' }).Count
$djs = @($jsRels | Where-Object { -not $jsRefNames.Contains($docs[$_].Name.ToLower()) }).Count
$lines.Add(("  Java      : {0} / {1} ({2:P1})" -f $dj, $javaRels.Count, $(if ($javaRels.Count) { $dj / $javaRels.Count } else { 0 })))
$lines.Add(("  JSP       : {0} / {1}" -f $dv, $viewRels.Count))
$lines.Add(("  statement : {0} / {1}" -f $dsm, $stmtRows.Count))
$lines.Add(("  JS        : {0} / {1}" -f $djs, $jsRels.Count))
$lines.Add("")
$lines.Add("[빌드 선언 (빌드 실행 안 함 / 네트워크 접근 안 함)]")
$lines.Add(("  빌드 모듈      : {0}" -f $modules.Count))
$lines.Add(("  선언 의존성    : {0} (고유 artifactId {1})" -f $deps.Count, @($deps | Select-Object -ExpandProperty artifactId -Unique).Count))
$lines.Add(("  버전 UNKNOWN   : {0}  (상위 pom property / dependencyManagement 상속 → 실물 확인 필요)" -f @($deps | Where-Object { $_.version -eq 'UNKNOWN' }).Count))
$lines.Add(("  서드파티 패키지: {0}종" -f $tpUse.Count))
$lines.Add("")
$lines.Add("[Java21 / Spring Boot 3 호환성 위험 (선언 기준)]")
foreach ($lv in @('상','중','하')) {
  $g = @($deps | Where-Object { $_.호환성위험 -eq $lv } | Select-Object -ExpandProperty artifactId -Unique)
  if ($g.Count -gt 0) { $lines.Add(("  위험 {0} : {1}건 - {2}" -f $lv, $g.Count, (($g | Select-Object -First 12) -join ', '))) }
}
$lines.Add("")
$lines.Add("[의존성 교차검증]")
$lines.Add(("  선언만(미사용 추정)      : {0}" -f @($cross | Where-Object { $_.상태 -eq '선언만(미사용 추정)' }).Count))
$lines.Add(("  사용만(선언없음/lib직접) : {0}  ← 빌드 재구성 시 누락 위험" -f @($cross | Where-Object { $_.상태 -eq '사용만(선언없음)' }).Count))
$lines.Add("")
$lines.Add("[인코딩]")
foreach ($g in ($docs.Values | Group-Object { $_.Enc } | Sort-Object Count -Descending)) {
  $lines.Add(("  {0,-10} {1}" -f $g.Name, $g.Count))
}
$lines.Add("")
$lines.Add("[Oracle 종속 상위]")
foreach ($g in ($oraRows | Group-Object 문법 | Sort-Object { ($_.Group | Measure-Object -Property '출현수' -Sum).Sum } -Descending | Select-Object -First 15)) {
  $lines.Add(("  {0,-14} 파일 {1,-5} 출현 {2}" -f $g.Name, $g.Count, ($g.Group | Measure-Object -Property '출현수' -Sum).Sum))
}
$lines.Add("")
$lines.Add("[주의] 미참조 후보는 '삭제 확정'이 아니다. 아래는 정적 분석으로 잡히지 않는다:")
$lines.Add("  - Class.forName / 문자열 조합 클래스 로딩")
$lines.Add("  - URL 직접 접근되는 JSP (웹서버 액세스로그로 교차검증)")
$lines.Add("  - DB 테이블에 저장된 화면/프로그램 매핑 (메뉴 테이블 확인 필수)")
$lines.Add("  - 배치 스케줄러(크론/외부 스케줄러)에서만 호출되는 클래스")
$lines.Add("  - WEB-INF/lib 에 직접 투입된 jar (빌드 선언에 없음) → 00_dependency-crosscheck.csv 의 '사용만' 행 확인")
$lines.Add("")
$lines.Add("[이 스크립트가 하지 않는 것]")
$lines.Add("  - mvn/ant/gradle 빌드 실행 안 함")
$lines.Add("  - 원격 저장소(nexus/maven central) 접근 안 함")
$lines.Add("  - jar 바이너리 해제/디컴파일 안 함 (jar 안의 클래스는 분석 범위 밖)")
$lines.Add("  → 따라서 의존성은 '선언된 것'과 '소스가 import 하는 것' 두 축으로만 파악한다.")

$lines -join "`r`n" | Set-Content -LiteralPath $sumPath -Encoding UTF8
Get-Content -LiteralPath $sumPath -Encoding UTF8 | Write-Host
Log "완료 → $Out"
