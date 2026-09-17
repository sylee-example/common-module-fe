# 레거시 시스템 분석 지시서 (LLM 전용)

> **대상 시스템**: Java 1.5 + JSP + jQuery + Oracle + MyBatis, 모노레포 구조
> **공통 모듈**: 별도 빌드 → jar 배포 → 각 서비스가 의존
> **목표**: Spring Boot 3.x (Java 21) + React 로의 소스 컨버전을 위한 전수 분석
> **이 문서 용도**: LLM(Claude Code 등)에게 던질 **분석 지시 프롬프트 모음 + 산출물 규격**

> ⚠️ **실행 환경: Windows 10 로컬 / 버전관리(git) 없음 / 빌드 실행 불가**
> 빌드(mvn·ant·gradle)는 사내 저장소·외부 서버를 호출하므로 **실행하지 않는다**. jar 바이너리도 열지 않는다.
> 분석 대상은 **소스 코드와 설정 파일 텍스트뿐**이다.
> 본문의 셸 블록은 macOS·Linux 기준 참고용이다. **Windows에서는 `scripts/analyze.ps1` 하나가 그 전부를 대체**한다.
> 기계적 수집·집계·죽은 코드 탐지는 전부 스크립트가 결정적으로 처리한다. LLM은 그 CSV 위에서 **판단만** 한다.
> → 실행법 **17장**, 저성능 모델 대응 **18장** 먼저 읽을 것.

---

## 0. 이 문서 사용법

1. 레거시 저장소 루트에 이 파일을 복사한다.
2. **Phase 0 → Phase 8** 순서대로 진행한다. 순서를 건너뛰지 않는다.
3. 각 Phase는 **셸 스크립트로 기계적 인덱스를 먼저 만들고**, 그 인덱스 위에서 LLM이 추론한다.
   → 소스 전체를 LLM 컨텍스트에 넣지 않는다. 이게 대용량 레거시 분석의 유일한 실전 전략.
4. 각 Phase 산출물은 **파일로 저장**한다. LLM 컨텍스트가 아니라 디스크가 누적 저장소다.
5. Phase 프롬프트는 그대로 복붙해서 쓴다.

---

## 1. LLM에게 주는 절대 규칙 (Ground Rules)

> 아래 블록을 **모든 Phase 프롬프트 맨 앞에 붙여서** 전달한다.

```text
[분석 규칙 — 반드시 준수]

1. 추측 금지.
   - 확인되지 않은 것은 "UNKNOWN" 으로 표기하고, `확인방법` 필드에 "무엇을 어떻게 보면 확인되는지"를 적는다.
   - "아마도", "일반적으로 ~일 것이다" 라는 서술을 산출물에 넣지 않는다.

2. 모든 주장에 근거를 단다.
   - 형식: `경로/파일명:라인번호`
   - 근거를 못 다는 항목은 산출물에서 제외하고 `unresolved.md` 에 기록한다.

3. 요약하지 말고 전수 기록한다.
   - "등", "외 다수", "기타 유사한 케이스" 금지.
   - 누락 1건이 컨버전 단계에서 장애 1건이 된다.
   - 양이 많으면 파일을 분할하되 항목을 줄이지 않는다.

4. 소스를 수정하지 않는다. 이 단계는 읽기 전용이다.
   - 파일 생성은 지정된 산출물 디렉토리(`_analysis/`) 안에서만 허용.

5. 토큰 절약 절차를 지킨다.
   - 파일 전체 읽기 금지. `grep -n` 으로 위치를 먼저 찾고, `sed -n 'START,ENDp'` 로 필요한 구간만 읽는다.
   - 동일 패턴 파일(예: CRUD JSP 200개)은 3~5개 대표 샘플을 정밀 분석 → 패턴 정의 → 나머지는 패턴 일치 여부만 기계적으로 검증한다.
   - 패턴에서 벗어난 파일(이상치)은 반드시 개별 분석한다. 이상치가 마이그레이션 리스크다.

6. 한 번에 한 Phase만 수행한다.
   - Phase 종료 시 산출물 파일을 저장하고, "다음 Phase 진행해도 되는지" 확인을 구한다.

7. 인코딩을 먼저 확인한다.
   - 한국 레거시는 EUC-KR/MS949 파일이 흔하다. `file -I` 로 확인하고, 깨진 문자열을 그대로 산출물에 복사하지 않는다.

8. 산출물 언어: 한국어. 식별자(클래스/테이블/URL)는 원문 그대로 유지한다.

9. 빌드하지 않는다. 네트워크에 접근하지 않는다.
   - `mvn`, `ant`, `gradle`, `npm install` 등 빌드/의존성 해석 명령을 실행하지 않는다.
     (사내 nexus·외부 저장소를 호출하므로 이 환경에서는 실패하거나 멈춘다)
   - jar/war 바이너리를 풀거나 디컴파일하지 않는다. `unzip`, `javap`, `jar -tf` 금지.
   - 따라서 의존성은 **선언 텍스트**(pom.xml / build.xml / .classpath)와
     **소스의 import 문** 두 축으로만 파악한다. 전이 의존성(transitive)은 알 수 없다 → UNKNOWN.
   - jar 안의 클래스 구현은 분석 범위 밖이다. 공통 모듈은 **jar가 아니라 소스 디렉토리**를 본다.
```

---

## 2. 산출물 디렉토리 규격

```
_analysis/
├── 00_overview/
│   ├── repo-map.md              # 모듈/디렉토리 지형도
│   ├── build-graph.md           # 빌드 순서, 의존 그래프
│   └── stats.md                 # 파일 수, LOC, 인코딩 분포
├── 01_common/
│   ├── common-api-surface.csv   # 공통 모듈 public API 전수
│   ├── common-usage-index.csv   # API별 사용처 역인덱스
│   ├── common-classification.md # 유틸/DB/인증/UI태그/프레임워크 분류
│   └── common-dead-api.csv      # 미사용 API = 포팅 제외 후보
├── 02_services/
│   ├── service-boundary.md      # 배포 단위 목록 + 규모
│   └── service-<NAME>.md        # 서비스별 상세
├── 03_screens/
│   ├── jsp-inventory.csv        # JSP 전수
│   ├── jsp-<NAME>.md            # 화면별 상세(복잡 화면만)
│   └── screen-to-react.csv      # JSP → React 컴포넌트 매핑
├── 04_endpoints/
│   ├── framework-detection.md   # 어떤 웹 프레임워크인지 판정 근거
│   └── endpoint-inventory.csv   # URL → 핸들러 → 서비스 → DAO 체인 전수
├── 05_data/
│   ├── mapper-inventory.csv     # MyBatis statement 전수
│   ├── oracle-dependency.csv    # Oracle 전용 문법 사용처
│   ├── procedure-inventory.csv  # 프로시저/함수 호출 전수
│   └── table-domain-map.md      # 테이블 → 도메인 묶음
├── 06_crosscutting/
│   ├── auth-session.md
│   ├── transaction.md
│   ├── file-io.md
│   ├── batch-scheduler.md
│   └── external-integration.md
├── 07_migration/
│   ├── complexity-score.csv     # 단위별 난이도 점수
│   └── migration-waves.md       # 이행 순서 묶음
├── 08_target/
│   └── as-is-to-be-map.md       # 기술 매핑표
└── unresolved.md                # 확인 실패 항목 누적
```

---

## 3. Phase 0 — 저장소 지형도 (기계적 수집)

### 3.1 먼저 실행할 셸 (LLM이 직접 실행)

```bash
mkdir -p _analysis/{00_overview,01_common,02_services,03_screens,04_endpoints,05_data,06_crosscutting,07_migration,08_target}

# 빌드 단위 식별
find . -name "pom.xml" -o -name "build.xml" -o -name "build.gradle" -o -name ".classpath" | sort

# 웹 배포 단위 식별 (= 서비스 경계 1차 후보)
find . -name "web.xml" | sort

# 파일 종류별 개수
find . -type f -name "*.*" ! -path "*/.git/*" | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -40

# 언어별 LOC
for e in java jsp js xml sql jspf tld; do
  printf "%-6s " "$e"
  find . -name "*.$e" ! -path "*/.git/*" -print0 | xargs -0 cat 2>/dev/null | wc -l
done

# 인코딩 분포 (EUC-KR 존재 여부가 중요)
find . \( -name "*.java" -o -name "*.jsp" \) ! -path "*/.git/*" -print0 \
  | xargs -0 file -I 2>/dev/null | sed 's/.*charset=//' | sort | uniq -c

# 죽은 코드 판별은 git 이력이 아니라 "참조 그래프"로 한다. (17장 analyze.ps1)
#   Java  : 진입점(web.xml/설정/JSP/main) → 참조 전이 폐쇄 → 미도달 클래스
#   JSP   : forward/include/href 로 아무도 지목하지 않는 파일
#   Mapper: statement id 가 Java 문자열 어디에도 없는 쿼리
#   JS    : <script src> / import 로 아무도 참조하지 않는 파일
```

### 3.2 프롬프트

```text
[분석 규칙 블록 붙일 것]

Phase 0: 저장소 지형도를 만든다.

수행:
1. 위 3.1 셸 명령을 실행하고 원시 출력을 보관한다.
2. 빌드 단위(pom.xml/build.xml/.classpath)별로 표를 만든다. → `00_modules.csv`
   | 모듈경로 | 빌드도구 | artifactId | version | packaging | parent | 하위모듈 | Java수 | JSP수 | Mapper수 |
   - 빌드를 실행해서 얻지 않는다. **선언 텍스트만 읽는다.**
   - Maven `<modules>` / Ant `<javac srcdir>` 로 모듈 포함 관계를 복원한다.
3. 의존 그래프를 텍스트로 그린다. 공통 모듈이 그래프의 어디에 있는지 명시한다.
   - `parent` 와 `<modules>` 로 만든다. 전이 의존성은 알 수 없으므로 그리지 않는다.
4. 죽은 코드는 git 이력이 아니라 **참조 그래프**로 판정한다. (`analyze.ps1` 의 `09_dead-*.csv`)
   - 판정 결과를 그대로 "삭제 확정"으로 쓰지 않는다. 15장의 정적 분석 사각지대 4종을 반드시 교차 확인한다.
5. 인코딩 분포를 기록한다. EUC-KR 파일이 있으면 해당 모듈 목록을 남긴다.

산출물:
- _analysis/00_overview/repo-map.md
- _analysis/00_overview/build-graph.md
- _analysis/00_overview/stats.md

주의: 이 Phase에서 소스 내용 해석은 하지 않는다. 지형도만 만든다.
```

---

## 4. Phase 1 — 공통 모듈 해부 (**가장 중요**)

> 공통 모듈이 jar로 박혀 있으면 "무엇이 진짜 쓰이는지"를 모른 채 전체 포팅하게 된다.
> **실제 호출되는 API만 포팅**하는 것이 컨버전 공수를 가장 크게 줄인다.

### 4.1 셸

```bash
# ※ jar 는 열지 않는다. 공통 모듈은 "소스 디렉토리"로 특정한다.
# 공통 모듈 소스 위치 = 다른 모듈들이 import 하는 패키지 prefix 가 정의된 모듈
grep -rn "<artifactId>" --include=pom.xml . | sort -u      # 선언 텍스트만 확인

# 공통 모듈 패키지 prefix 확인 (예: com.company.common)
find <공통모듈경로>/src -name "*.java" | sed 's|.*/src/[^/]*/java/||; s|/[^/]*\.java$||' | tr '/' '.' | sort | uniq -c

# public API 전수 추출
grep -rn -E "^\s*public\s+(abstract\s+|final\s+)?(class|interface|enum)\s+\w+" \
  --include="*.java" <공통모듈경로>/src > _analysis/01_common/_raw-classes.txt
grep -rn -E "^\s*public\s+(static\s+)?[\w<>\[\],\s]+\s+\w+\s*\(" \
  --include="*.java" <공통모듈경로>/src > _analysis/01_common/_raw-methods.txt

# 사용처 역인덱스 (공통 패키지 import 전수)
grep -rn "import com.company.common" --include="*.java" . \
  | sed 's/:.*import /\t/' > _analysis/01_common/_raw-imports.txt

# JSP 쪽 사용 (커스텀 태그라이브러리)
find . -name "*.tld" | sort
grep -rn "taglib" --include="*.jsp" --include="*.jspf" . | grep -v "http://java.sun.com" | sort -u
```

### 4.2 프롬프트

```text
[분석 규칙 블록 붙일 것]

Phase 1: 공통 모듈(jar)을 해부한다.

수행:
1. 공통 모듈 **소스 디렉토리**를 특정한다. (jar 파일은 열지 않는다)
   - 근거: 다른 모듈들이 import 하는 패키지 prefix 가 선언된 모듈 = 공통 모듈
   - 각 서비스 pom.xml/.classpath 가 선언한 공통 모듈 **버전이 서로 다르면 전부 기록**한다. (버전 분기 = 리스크)
   - 선언에 버전이 없거나 `${...}` property 면 UNKNOWN 으로 두고 `확인방법: 상위 pom 실물 확인` 을 적는다.
   - WEB-INF/lib 에 공통 jar 가 직접 들어있는데 선언이 없으면, 그 사실만 기록한다. (jar 내부는 보지 않는다)

2. public API를 전수 추출해 CSV로 만든다.
   common-api-surface.csv
   컬럼: 패키지, 클래스, 종류(class|interface|enum|abstract|tag), 메서드시그니처, 정적여부, 파일경로:라인

3. 사용처 역인덱스를 만든다.
   common-usage-index.csv
   컬럼: 공통클래스, 공통메서드, 호출서비스, 호출파일경로:라인, 호출횟수
   - JSP의 커스텀 태그 사용도 포함한다 (tld 기준).
   - 리플렉션/문자열 클래스명 로딩이 있으면 별도 표시한다. (정적 추적 불가 → UNKNOWN)

4. 공통 API를 아래 5종으로 분류한다. (common-classification.md)
   A. 순수 유틸 (무상태: 문자열/날짜/숫자/암호화) → React·Spring 양쪽으로 기계적 포팅 가능
   B. DB 접근 공통 (Connection/DAO base/페이징 쿼리 생성기) → Spring Data/MyBatis 설정으로 대체
   C. 인증·세션·권한 → Spring Security 로 재설계 (직접 포팅 금지 대상)
   D. UI 공통 (커스텀 tld, JSP include 조각, 공통 JS) → React 컴포넌트로 재작성
   E. 프레임워크 코어 (자체 MVC/Action 디스패처/공통 Controller 상속) → Spring MVC 로 대체, 포팅 불가

5. 미사용 API 목록을 만든다. (common-dead-api.csv)
   - 사용처 역인덱스에 0건인 public API
   - 이것이 "포팅 제외 후보". 전체 API 대비 몇 %인지 수치로 제시한다.

6. 각 서비스별 "공통 모듈 의존 깊이" 점수를 낸다.
   - 사용 클래스 수 / 사용 호출 라인 수 / E분류(프레임워크 코어) 사용 여부
   - E를 쓰는 서비스는 단독 마이그레이션이 불가능하다. 반드시 표시한다.

산출물: _analysis/01_common/ 전체

검증: 공통 API 총 개수 = (분류 A+B+C+D+E 합계) + 미사용 개수. 불일치 시 누락이 있다는 뜻이므로 재수행.
```

---

## 5. Phase 2 — 서비스 경계 식별

### 5.1 셸

```bash
# 배포 단위별 컨텍스트
for w in $(find . -name "web.xml"); do
  echo "=== $w"
  grep -n -E "servlet-class|url-pattern|filter-class|listener-class|param-name" "$w"
done

# 배포 단위별 규모
for w in $(find . -name "web.xml"); do
  root=$(dirname $(dirname "$w"))
  printf "%-50s jsp=%-5s java=%-5s\n" "$root" \
    "$(find "$root" -name '*.jsp' | wc -l)" \
    "$(find "$root" -name '*.java' | wc -l)"
done
```

### 5.2 프롬프트

```text
[분석 규칙 블록 붙일 것]

Phase 2: 서비스(배포) 경계를 확정한다.

수행:
1. web.xml 1개 = 배포 단위 1개로 본다. 전수 목록화.
   | 서비스명 | context-root | WAR/모듈 경로 | JSP수 | Java수 | Mapper수 | 참조 공통 jar 버전 |

2. 각 서비스의 진입 URL 패턴을 web.xml에서 추출한다. (servlet-mapping, filter-mapping)

3. 서비스 간 공유 자원을 찾는다.
   - 동일 DB 테이블 접근: mapper XML의 테이블명 교집합
   - 동일 세션 키 사용: getAttribute("...") 문자열 교집합
   - 서비스 간 직접 호출(HTTP/파일/DB링크) 여부
   → 공유가 많은 서비스 묶음은 마이그레이션 시 함께 움직여야 한다. 그룹으로 표시.

4. 각 서비스를 아래로 태깅한다.
   - [대외] 외부 사용자용 / [대내] 내부 직원용 / [배치] 화면 없음 / [연계] 인터페이스 전용
   근거: URL 패턴, 인증 방식, 화면 유무

산출물:
- _analysis/02_services/service-boundary.md
- _analysis/02_services/service-<서비스명>.md (서비스마다 1개)
```

---

## 6. Phase 3 — 화면(JSP) 인벤토리 → React 매핑

### 6.1 셸

```bash
# JSP 전수 + 크기
find . -name "*.jsp" -o -name "*.jspf" | while read f; do
  printf "%s\t%s\t%s\n" "$f" "$(wc -l < "$f")" "$(grep -c '<%' "$f")"
done | sort -k3 -rn > _analysis/03_screens/_raw-jsp.tsv
# 3번째 컬럼 = 스크립틀릿 개수. 높을수록 BE 이전 대상 로직이 많다.

# 레이아웃 구조 (tiles / include)
find . -name "tiles*.xml" -o -name "*-tiles.xml" | sort
grep -rn -E "<jsp:include|<%@\s*include" --include="*.jsp" . | sed 's/:.*file=/\t/' | sort -u

# ajax 호출 URL 전수
grep -rn -E "\\\$\.(ajax|get|post|getJSON)\s*\(" --include="*.js" --include="*.jsp" . \
  > _analysis/03_screens/_raw-ajax.txt
grep -rn -E "url\s*:\s*['\"]" --include="*.js" --include="*.jsp" . | sort -u

# form 전수
grep -rn -E "<form[^>]*action=" --include="*.jsp" . | sort -u

# 위험 요소 (현대 브라우저 미지원)
grep -rln -iE "ActiveX|<object|classid=|npapi|\.ocx|document\.all|window\.showModalDialog|attachEvent" \
  --include="*.jsp" --include="*.js" .

# 리포팅/엑셀 툴
grep -rln -iE "ozreport|crystal|jasper|poi\.|HSSFWorkbook|XSSFWorkbook|excel" --include="*.java" --include="*.jsp" .
```

### 6.2 프롬프트

```text
[분석 규칙 블록 붙일 것]

Phase 3: 화면을 전수 인벤토리화하고 React 구조로 매핑한다.

수행:
1. jsp-inventory.csv 를 만든다. JSP/JSPF 전수.
   컬럼:
   서비스, 파일경로, 역할(layout|page|fragment|popup|include-only),
   화면명(title 또는 주석에서 추출, 없으면 UNKNOWN),
   진입URL(Phase 4 endpoint와 연결, 미정이면 UNKNOWN),
   LOC, 스크립틀릿라인수,
   form수, form의 action목록,
   ajax호출URL목록,
   사용taglib(표준/커스텀 구분),
   그리드유무(테이블+페이징), 파일업로드, 파일다운로드, 엑셀, 리포트출력, 팝업호출, 달력, 트리,
   레거시위험요소(ActiveX/showModalDialog/document.all 등),
   재사용가능성(공통조각인지)

2. 스크립틀릿 로직을 분류한다. (핵심)
   각 JSP의 `<% %>` 안 코드를 아래로 나눈다.
   - (가) 단순 출력/포맷팅 → React 렌더링으로 흡수
   - (나) 조건 분기/반복 → React JSX 로 변환
   - (다) **비즈니스 로직/DB 접근/계산** → 백엔드 API 로 이전 필수
   (다)에 해당하는 JSP는 별도 목록으로 뽑는다. 이게 컨버전 난이도의 1순위 지표다.

3. 레이아웃 구조를 도식화한다.
   - 공통 header/footer/menu/left 조각 식별
   - Tiles 정의가 있으면 definition → JSP 매핑표
   → React: App Layout / Route Layout / Page 구조 제안으로 변환

4. screen-to-react.csv 를 만든다.
   컬럼: JSP경로, React라우트경로, React컴포넌트명(PascalCase), 컴포넌트유형(Page|Layout|Modal|Form|Grid),
        필요한공통컴포넌트(Grid/DatePicker/FileUpload/Tree/Modal),
        폼처리(React Hook Form + Zod 필요 여부), 상태관리필요(Zustand 여부),
        호출API목록(Phase 4 endpoint id), 난이도(1~5), 비고

5. 화면 중복을 찾는다.
   구조가 90% 이상 동일한 CRUD 화면 군집을 묶는다.
   → "패턴 1개 + 설정 N개" 로 컨버전 가능한 후보. 여기서 공수가 크게 줄어든다.

산출물: _analysis/03_screens/ 전체
```

---

## 7. Phase 4 — 웹 프레임워크 판정 & 엔드포인트 인벤토리

### 7.1 셸

```bash
# 프레임워크 흔적 탐지
find . -name "struts-config*.xml" -o -name "struts.xml" -o -name "*-servlet.xml" \
     -o -name "applicationContext*.xml" -o -name "spring*.xml" | sort
grep -rn -E "extends\s+(Action|DispatchActionServlet|HttpServlet|AbstractController|SimpleFormController)" \
  --include="*.java" . | sort -u | head -50
grep -rn -E "@(Controller|RequestMapping|RestController)" --include="*.java" . | head -20
# 위 3개 모두 비면 자체 프레임워크. 그때는 web.xml의 servlet-class 를 진입점으로 역추적.

# Service / DAO 레이어 탐지
grep -rln -E "class \w*(Service|ServiceImpl|BO|Manager)\b" --include="*.java" . | wc -l
grep -rln -E "class \w*(DAO|Dao|Mapper)\b" --include="*.java" . | wc -l

# MyBatis 호출 지점
grep -rn -E "\.(queryForObject|queryForList|insert|update|delete|selectOne|selectList)\s*\(" \
  --include="*.java" . > _analysis/04_endpoints/_raw-dbcalls.txt

# 화면 반환 방식 (forward vs json)
grep -rn -E "forward\(|ModelAndView|\.jsp\"" --include="*.java" . | wc -l
grep -rn -E "application/json|JSONObject|Gson|ObjectMapper|response.getWriter" --include="*.java" . | wc -l
```

### 7.2 프롬프트

```text
[분석 규칙 블록 붙일 것]

Phase 4: 서버 진입점부터 DB까지의 호출 체인을 전수 추적한다.

수행:
1. 웹 프레임워크를 판정한다. (framework-detection.md)
   후보: Struts 1.x / Struts 2 / Spring MVC 2~3 / 순수 Servlet / 자체 프레임워크
   판정 근거를 파일:라인으로 제시한다. 혼용되어 있으면 서비스별로 각각 판정한다.
   자체 프레임워크인 경우:
   - 디스패처 클래스와 URL→클래스 매핑 규칙(설정파일/네이밍컨벤션/DB테이블)을 반드시 특정한다.
   - 이게 특정 안 되면 이후 Phase 전부 신뢰할 수 없다. 여기서 멈추고 보고한다.

2. endpoint-inventory.csv 를 만든다. **이것이 백엔드 컨버전의 마스터 문서다.**
   컬럼:
   endpoint_id(일련번호), 서비스, HTTP메서드, URL패턴,
   핸들러클래스:메서드(파일경로:라인),
   요청파라미터(이름/타입/필수여부, 추출근거),
   호출Service, 호출DAO, 호출MyBatis statement id 목록,
   응답형태(jsp-forward | redirect | json | xml | file-download | excel),
   응답JSP경로 또는 응답DTO,
   트랜잭션처리방식(선언적|수동commit|없음),
   인증필요여부, 권한코드,
   비고

3. 체인 추적 방법:
   URL → 핸들러 → Service → DAO → Mapper statement → SQL → 테이블
   중간 단계가 없으면(예: 핸들러가 직접 SQL 실행) 그대로 기록한다. 있는 척하지 않는다.

4. 응답형태 기준으로 이행 방식을 분류한다.
   - jsp-forward → React 라우트 + 데이터 조회 GET API 신설 필요 (기존 API 없음!)
   - json → 기존 API 그대로 REST로 이전 가능 (가장 저렴)
   - file-download / excel → 별도 취급, Spring에서 스트리밍 재구현
   각 분류의 건수를 집계한다. jsp-forward 비율이 높을수록 API 신설 공수가 크다.

5. 중복 엔드포인트를 찾는다. 동일 기능이 서비스마다 복붙된 케이스.
   → 통합 API 후보로 표시.

산출물: _analysis/04_endpoints/ 전체
```

---

## 8. Phase 5 — 데이터 계층 (MyBatis + Oracle)

### 8.1 셸

```bash
# mapper XML 전수
find . -name "*.xml" -path "*map*" -o -name "*Mapper.xml" -o -name "*-sql.xml" | sort
grep -rln -E "<(select|insert|update|delete)\s+id=" --include="*.xml" . \
  > _analysis/05_data/_raw-mapper-files.txt

# statement 전수
grep -rn -E "<(select|insert|update|delete|sql|procedure)\s+id=\"[^\"]+\"" --include="*.xml" . \
  > _analysis/05_data/_raw-statements.txt

# 테이블 참조 전수
grep -rhoiE "(from|join|into|update)\s+[A-Za-z_][A-Za-z0-9_]*" --include="*.xml" . \
  | awk '{print toupper($2)}' | sort | uniq -c | sort -rn > _analysis/05_data/_raw-tables.txt

# Oracle 전용 문법 탐지
for p in "ROWNUM" "CONNECT BY" "START WITH" "DECODE" "NVL" "NVL2" "(+)" "SYSDATE" "DUAL" \
         "NEXTVAL" "MERGE INTO" "LISTAGG" "WM_CONCAT" "TO_CHAR" "TO_DATE" "TRUNC" \
         "PARTITION BY" "OVER (" "REGEXP_" "XMLAGG" "PIVOT" "MINUS" "LEVEL"; do
  printf "%-14s %s\n" "$p" "$(grep -ric -- "$p" --include="*.xml" . | awk -F: '{s+=$2} END{print s+0}')"
done

# 프로시저/함수 호출
grep -rn -E "\{\s*call |CallableStatement|<procedure|prepareCall" --include="*.xml" --include="*.java" .

# 동적 SQL 복잡도
grep -rc -E "<(if|choose|when|foreach|trim|where|set)\b" --include="*.xml" . | sort -t: -k2 -rn | head -30
```

### 8.2 프롬프트

```text
[분석 규칙 블록 붙일 것]

Phase 5: 데이터 계층을 전수 분석한다.

수행:
1. mapper-inventory.csv
   컬럼: 파일경로, namespace, statement_id, 종류(select|insert|update|delete|procedure),
        parameterType, resultType/resultMap, 참조테이블목록,
        동적SQL태그수, SQL라인수, 호출하는Java위치(파일:라인),
        endpoint_id(Phase 4 연결), 복잡도(1~5)

2. oracle-dependency.csv
   컬럼: 문법(ROWNUM/CONNECT BY/DECODE/(+)/NEXTVAL 등), 파일경로:라인, statement_id,
        대체방안, 위험도(상|중|하)
   - `ROWNUM` 페이징 → 표준 OFFSET/FETCH 또는 MyBatis RowBounds
   - `CONNECT BY` 계층쿼리 → 재귀 CTE 또는 애플리케이션 레벨 트리 구성 (**위험도 상**)
   - `(+)` 구식 외부조인 → ANSI OUTER JOIN
   - `NEXTVAL` 시퀀스 → 시퀀스 유지 or IDENTITY 전략
   - 프로시저 호출 → **위험도 상**, 별도 마이그레이션 트랙

3. procedure-inventory.csv
   컬럼: 프로시저명, 호출위치(파일:라인), IN/OUT 파라미터, 소스보유여부(DB에만 있으면 UNKNOWN),
        추정역할, 대체전략(Java로직 이전 | 프로시저 유지 | 재작성)
   - 프로시저 소스가 저장소에 없으면 반드시 UNKNOWN 표기하고 `확인방법: DBA에게 DDL 요청` 을 적는다.

4. table-domain-map.md
   - 테이블명 prefix / 조인 그래프 / 동일 statement 내 동시 참조 빈도를 근거로 도메인 군집을 만든다.
   - 군집 = Spring Boot 패키지 분할 단위 후보 (도메인형 패키지 구조)
   - 여러 서비스가 함께 쓰는 테이블은 "공유 테이블"로 표시. 분리 시 가장 큰 제약이 된다.

5. MyBatis 유지 vs JPA 전환 판단을 내린다.
   기준:
   - 동적SQL 태그 사용 statement 비율
   - 다중 테이블 조인/집계 쿼리 비율
   - Oracle 전용 문법 비율
   위 3개가 높으면 → **MyBatis 3 유지** (mybatis-spring-boot-starter) 권고.
   단순 CRUD 비율이 높으면 → 해당 도메인만 JPA 전환 후보.
   판단 근거를 수치로 제시한다. 취향으로 결정하지 않는다.

산출물: _analysis/05_data/ 전체
```

---

## 9. Phase 6 — 횡단 관심사

### 9.1 셸

```bash
# 세션/인증
grep -rn -E "getSession\(|setAttribute\(|getAttribute\(" --include="*.java" --include="*.jsp" . \
  | grep -oE "(set|get)Attribute\(\s*\"[^\"]+\"" | sort | uniq -c | sort -rn
grep -rln -iE "login|logout|authenticat|sso|saml|ldap|cert|gpki|npki" --include="*.java" .

# 권한
grep -rn -iE "권한|authority|role|menuAuth|hasAuth|checkAuth|Privilege" --include="*.java" . | head -40

# 트랜잭션 (수동 제어 여부가 핵심)
grep -rn -E "setAutoCommit|\.commit\(\)|\.rollback\(\)|TransactionManager|@Transactional" --include="*.java" .

# 파일 I/O
grep -rln -iE "MultipartRequest|FileUpload|commons-fileupload|FileOutputStream|getRealPath|ServletOutputStream" --include="*.java" .

# 배치/스케줄러
find . -name "quartz*.xml" -o -name "*scheduler*" -o -name "*batch*" | sort
grep -rln -iE "Quartz|TimerTask|ScheduledExecutor|CronTrigger|main\s*\(\s*String" --include="*.java" .

# 로깅/설정
find . -name "log4j*.xml" -o -name "log4j*.properties" -o -name "logback*.xml" | sort
find . -name "*.properties" ! -path "*/.git/*" | sort

# 외부 연동
grep -rln -iE "HttpURLConnection|HttpClient|Socket|FTP|SOAP|WebService|JNDI|MQ|Kafka|EAI" --include="*.java" .

# 하드코딩된 접속정보 (보안 점검)
grep -rn -iE "jdbc:oracle|password\s*=|passwd\s*=" --include="*.xml" --include="*.properties" --include="*.java" . | head -40
```

### 9.2 프롬프트

```text
[분석 규칙 블록 붙일 것]

Phase 6: 횡단 관심사를 분석한다. 이 영역은 "직접 포팅"이 아니라 "재설계" 대상이다.

산출물별 수행 내용:

auth-session.md
 - 로그인 처리 흐름을 진입 URL부터 세션 저장까지 파일:라인으로 추적
 - HttpSession 에 담기는 키 전수 목록 (키명, 담기는 값의 타입, 담는 위치, 읽는 위치)
 - 세션 클러스터링 여부, 세션 타임아웃 설정
 - 권한 체크 방식 (필터 | 인터셉터 | 각 화면 개별 체크 | JSP 내부 체크)
 - 외부 인증 연동 (SSO/LDAP/공인인증서) 유무
 → To-Be 권고: Spring Security + (JWT | Redis 세션) 중 어느 쪽인지, 근거와 함께 1개만 제시

transaction.md
 - 트랜잭션 경계가 어디인지 (Service? DAO? 없음?)
 - 수동 commit/rollback 이 있으면 **전수 목록**. 이건 이전 시 버그 온상이다.
 - 분산 트랜잭션/다중 DataSource 여부

file-io.md
 - 업로드 저장 경로(getRealPath 사용 여부 = 컨테이너 종속), 파일명 규칙, 용량 제한
 - 다운로드 구현 방식, 한글 파일명 인코딩 처리
 → To-Be: 스토리지 분리 필요 여부 판단

batch-scheduler.md
 - 배치 프로그램 전수 (진입 main 클래스, 실행 주기, 크론 등록 위치)
 - 웹 애플리케이션 내부 스케줄러 vs 외부 크론 구분

external-integration.md
 - 외부 시스템 연동 전수: 대상, 프로토콜, 호출 위치(파일:라인), 인터페이스 규격 문서 유무
 - 리포팅 툴(OZ/Crystal/Jasper), 전자결재, 결제, 알림(SMS/메일)
 → 각 항목의 "React/Spring Boot 환경에서 계속 동작 가능한가" 를 판정. 불가하면 대체안 명시.

추가: 하드코딩된 DB 접속정보/비밀번호가 발견되면 값 자체는 산출물에 쓰지 말고
     위치(파일:라인)와 종류만 기록한다.
```

---

## 10. Phase 7 — 난이도 산정 & 이행 웨이브 묶기

```text
[분석 규칙 블록 붙일 것]

Phase 7: 마이그레이션 단위별 난이도를 점수화하고 이행 순서를 정한다.

1. complexity-score.csv
   단위 = "화면 1개 + 그에 딸린 엔드포인트/쿼리" (기능 단위)
   컬럼: 기능ID, 서비스, 화면명, JSP경로, endpoint_id목록, statement_id목록,
        S1_화면복잡도, S2_스크립틀릿로직량, S3_SQL복잡도, S4_공통모듈의존, S5_외부연동, S6_Oracle종속,
        총점, 등급(S/A/B/C), 예상공수(인일)

   점수 기준 (각 0~5):
   S1 화면복잡도    : 폼 수, 그리드 유무, 팝업 수, JS LOC
   S2 스크립틀릿로직: JSP 내 비즈니스 로직 라인 수 (Phase 3의 (다) 분류)
   S3 SQL복잡도     : 동적SQL 태그 수, 조인 테이블 수, SQL 라인 수
   S4 공통모듈의존  : E분류(프레임워크 코어) 사용=5, C분류(인증)=4, B=3, A/D=1
   S5 외부연동      : 리포트/결제/인증서/EAI 연동 있으면 5
   S6 Oracle종속    : CONNECT BY/프로시저=5, ROWNUM/(+)=2, 없음=0

   등급: C(≤8 단순, 자동변환 가능) / B(9~15) / A(16~22) / S(23~ 재설계 필요)

2. migration-waves.md
   Wave 0 — 기반: 공통 모듈 A/B분류 포팅, 인증(C분류) 재설계, 공통 React 컴포넌트 구축
   Wave 1 — C등급 다수 + 서비스 간 공유 적은 기능: 패턴 확립 목적
   Wave 2 — B등급 주력
   Wave 3 — A/S등급, 프로시저 의존, 외부 연동
   각 Wave에 포함 기능ID를 전부 나열한다. "등" 금지.

   제약 조건을 명시한다:
   - Phase 2의 "공유 테이블/공유 세션" 그룹은 같은 Wave에 넣는다.
   - Phase 1의 E분류(프레임워크 코어) 사용 서비스는 Wave 0 완료 전 착수 불가.

3. 병행 운영 전략을 1개 제시한다.
   - 리버스 프록시로 URL 단위 신/구 분기 (Strangler Fig)
   - 세션 공유 방식 (구 JSP 세션 ↔ 신 Spring Boot 인증)
   - 두 시스템이 같은 Oracle DB를 동시에 쓰는 기간의 정합성 처리
```

---

## 11. Phase 8 — As-Is → To-Be 매핑표

```text
[분석 규칙 블록 붙일 것]

Phase 8: 기술 매핑표를 확정한다. 앞 Phase의 실측치를 근거로 작성한다.

as-is-to-be-map.md 기본 틀 (프로젝트 실측에 맞게 조정):

| 영역 | As-Is | To-Be | 비고 |
|---|---|---|---|
| 언어 | Java 1.5 | Java 21 | Generics/Optional/Record/Stream 전면 적용 |
| 런타임 | WAS(WebLogic/Jeus/Tomcat 5) | Spring Boot 3.x 내장 Tomcat | javax.* → jakarta.* 전환 필수 |
| 웹계층 | Struts Action / 자체 MVC | @RestController | JSP forward → JSON API 신설 |
| 화면 | JSP + Tiles + JSTL | React + React Router | Phase 3 매핑표 기준 |
| 스크립트 | jQuery | React + TypeScript | any 금지 |
| 스타일 | 자체 CSS | Tailwind CSS | |
| UI 컴포넌트 | 커스텀 tld | antd + 사내 공통 컴포넌트 | |
| 그리드 | JSP 테이블 + 수동 페이징 | ag-grid 래퍼 컴포넌트 | 서버사이드 페이징 API 규격 통일 |
| 폼 | form submit + JS 검증 | React Hook Form + Zod | 검증 규칙을 BE Bean Validation과 이중화 |
| 상태 | 세션 + hidden input | Zustand + 서버상태 캐시 | |
| 통신 | form submit / $.ajax | fetch/axios + 공통 인터셉터 | 응답 포맷 통일 |
| 서비스계층 | XxxService(수동 생성) | @Service + 생성자 주입 | |
| DTO | Map<String,Object> / HashMap | Record DTO | **Map 남용 제거가 핵심 작업** |
| 데이터 | MyBatis 2.x + 수동 SqlMapClient | MyBatis 3 (starter) | Phase 5 판단 결과 반영 |
| 트랜잭션 | 수동 commit/rollback | @Transactional | Phase 6 수동제어 목록 전수 이전 |
| 인증 | HttpSession 직접 제어 | Spring Security + (JWT\|Redis Session) | Phase 6 결론 반영 |
| 예외 | try-catch 삼키기/printStackTrace | @RestControllerAdvice 전역 처리 | 응답 포맷 일관 |
| 로깅 | log4j 1.x / System.out | SLF4J + Logback | |
| 설정 | properties 산재 + 하드코딩 | application.yml + 환경분리 | 시크릿 외부화 |
| DB | Oracle | Oracle 유지 (권고) | 전환 시 Phase 5 oracle-dependency 전량이 작업 대상 |
| 캐시 | 없음 / static Map | Redis | |
| 빌드 | Ant/Maven2 + jar 수동 배포 | Gradle/Maven + 사내 저장소 | 공통 모듈 = npm(FE) + maven(BE) 2트랙 |
| 테스트 | 없음 | JUnit 5 + Testcontainers / Vitest | 신규 코드 필수 |

각 행마다 "이 프로젝트에서 실제 해당하는 건수 / 파일 목록 참조" 를 덧붙인다.
As-Is 칸에 근거 없는 항목은 UNKNOWN으로 남기고 추측으로 채우지 않는다.

추가로 API 응답 규격을 1개 정의한다. (전 서비스 공통)
  { "success": bool, "code": string, "message": string, "data": T, "timestamp": string }
  페이징: { "content": T[], "page": n, "size": n, "totalElements": n, "totalPages": n }
```

---

## 12. 대용량 대응: 컨텍스트 분할 전략

> 소스가 수십만~수백만 라인이면 단일 세션으로 불가능하다. 아래를 강제한다.

1. **디스크를 메모리로 쓴다.** 각 Phase 산출물은 즉시 파일 저장. 다음 Phase는 **원본 소스가 아니라 이전 Phase 산출물(CSV/MD)** 을 입력으로 삼는다.
2. **분할 축은 "서비스 단위"**. Phase 3~6은 서비스마다 독립 실행 가능하다. 서비스별로 세션/서브에이전트를 분리한다.
3. **샘플링 후 패턴 검증**: 동일 패턴 파일 N개 → 대표 3~5개 정밀 분석 → 패턴 정의 → 나머지는 `grep` 기반 일치 검증만. 불일치 파일만 개별 분석.
4. **CSV 우선**. 표는 마크다운 표가 아니라 CSV로 쓴다. 토큰이 적고 다음 단계에서 기계 처리된다.
5. **중간 요약 금지**. 요약하면 다음 Phase에서 근거를 잃는다. 대신 파일을 분할한다.
6. **재개 지점 기록**: 각 Phase 산출물 첫 줄에 `# 진행: 완료 | 진행중(마지막 처리 파일: X)` 을 남긴다. 세션이 끊겨도 이어서 진행.

서브에이전트 분할 예시:
```text
에이전트1: 서비스A의 Phase 3(화면) 수행 → _analysis/03_screens/jsp-inventory-A.csv 저장
에이전트2: 서비스B의 Phase 3 수행 → ...-B.csv 저장
(각 에이전트는 자기 서비스 경로 밖을 읽지 않는다)
메인: 산출물 병합 + 서비스 간 중복/공유 분석
```

---

## 13. 산출물 JSON 스키마 (다음 단계 자동화용)

> 컨버전 코드 생성 단계에서 기계적으로 소비할 수 있도록, 최종적으로 아래 형태로 통합한다.

```json
{
  "service": "portal",
  "features": [
    {
      "featureId": "PTL-0001",
      "screenName": "사용자 목록",
      "legacy": {
        "jsp": ["/portal/user/userList.jsp", "/portal/user/userSearch.jspf"],
        "handler": "com.company.portal.user.UserAction#list (UserAction.java:88)",
        "endpoints": [
          {
            "method": "POST",
            "url": "/portal/user/list.do",
            "params": [{"name": "searchType", "type": "String", "required": false}],
            "responseType": "jsp-forward",
            "statements": ["user.selectUserList", "user.selectUserListCount"]
          }
        ],
        "tables": ["TB_USER", "TB_DEPT"],
        "commonApis": ["com.company.common.util.StringUtil#nvl", "com.company.common.web.PagingUtil"],
        "oracleDependencies": ["ROWNUM", "DECODE"]
      },
      "target": {
        "backend": {
          "controller": "UserController",
          "method": "GET /api/v1/users",
          "requestDto": "UserSearchRequest",
          "responseDto": "PageResponse<UserResponse>",
          "service": "UserService",
          "mapper": "UserMapper"
        },
        "frontend": {
          "route": "/users",
          "component": "UserListPage",
          "type": "Page",
          "usesCommon": ["DataGrid", "SearchForm", "DatePicker"],
          "form": "React Hook Form + Zod",
          "state": "Zustand(검색조건)"
        }
      },
      "complexity": {"S1": 3, "S2": 1, "S3": 2, "S4": 2, "S5": 0, "S6": 2, "total": 10, "grade": "B"},
      "wave": 1,
      "risks": ["페이징이 ROWNUM 기반이라 정렬 변경 시 결과 달라짐"],
      "unknowns": []
    }
  ]
}
```

---

## 14. 검증 체크리스트 (각 Phase 종료 시 LLM이 자가 점검)

```text
[ ] 산출물의 모든 행에 `파일경로:라인` 근거가 있는가?
[ ] "등", "외 다수", "기타" 라는 표현이 산출물에 없는가?
[ ] 추측 서술("아마", "일반적으로", "~로 보인다")이 없는가? 있으면 UNKNOWN + 확인방법으로 바꿨는가?
[ ] 건수 합계가 맞는가? (예: JSP 전체 수 == 인벤토리 행 수)
[ ] 확인 실패 항목이 unresolved.md 에 전부 기록되었는가?
[ ] 이전 Phase 산출물과 ID가 연결되는가? (endpoint_id, statement_id, featureId)
[ ] 원본 소스를 수정하지 않았는가?
[ ] 재개 지점(`# 진행:`)을 기록했는가?
```

---

## 15. 절대 하지 말 것 (LLM 실패 패턴)

| 하지 말 것 | 이유 |
|---|---|
| 소스 전체를 읽으려 시도 | 컨텍스트 초과로 중간부터 환각 시작 |
| "전형적인 Struts 구조이므로..." 같은 일반론 서술 | 레거시는 반드시 자체 개조가 섞여 있다 |
| 공통 모듈을 통째로 포팅 대상으로 잡음 | 실사용 API만 포팅하면 공수가 크게 줄어든다 |
| JSP를 React로 1:1 기계 변환 | 스크립틀릿 비즈니스 로직이 그대로 프론트로 넘어가 보안/정합성 붕괴 |
| `Map<String,Object>` 를 그대로 유지 | 타입 안정성 상실, any 금지 원칙 위반 |
| 프로시저를 나중에 보기로 미룸 | 가장 늦게 터지고 가장 크게 터진다. Phase 5에서 반드시 목록화 |
| 분석 없이 바로 코드 생성 시작 | 산출물 없이 만든 코드는 검증 불가 |
| `mvn`/`ant`/`gradle` 실행, `npm install` | 사내·외부 저장소 호출 → 실패하거나 멈춘다. 이 환경에서 금지 |
| jar 해제·디컴파일(`unzip`/`javap`) | 분석 범위 밖. 공통 모듈은 소스 디렉토리를 본다 |
| 전이 의존성을 추측해서 채움 | 빌드 없이는 알 수 없다. UNKNOWN 이 정답 |
| 엔드포인트 인벤토리 없이 API 설계 | 기존 기능 누락이 운영 장애로 직결 |

---

## 16. 실행 순서 요약

```text
Phase 0  지형도          → 모듈/빌드/규모/인코딩
Phase 1  공통 모듈 해부   → API 전수 + 사용 역인덱스 + 미사용 제거   ★최우선
Phase 2  서비스 경계      → 배포 단위 + 공유 자원 그룹
Phase 3  화면 인벤토리    → JSP 전수 + React 매핑 + 중복 패턴 군집
Phase 4  엔드포인트       → URL→핸들러→SQL 체인 전수               ★백엔드 마스터
Phase 5  데이터 계층      → mapper/Oracle종속/프로시저
Phase 6  횡단 관심사      → 인증/트랜잭션/파일/배치/외부연동
Phase 7  난이도·웨이브    → 점수화 + 이행 순서
Phase 8  As-Is→To-Be     → 기술 매핑 확정
```

**Phase 1과 Phase 4를 통과하지 못하면 컨버전을 시작하지 않는다.**

---

## 17. Windows 10 실행 가이드 (git 없음)

### 17.1 실행

```powershell
# PowerShell 5.1 (Win10 기본 탑재). 관리자 권한 불필요.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 최초 1회: 소규모 디렉토리로 스모크 테스트 (스크립트가 도는지 확인)
.\scripts\analyze.ps1 -Root "D:\legacy\portal" -Out "D:\legacy\_analysis_test"

# 전체 실행
.\scripts\analyze.ps1 -Root "D:\legacy" -CommonPkg "com.company.common"
```

파라미터:

| 파라미터 | 설명 |
|---|---|
| `-Root` | 레거시 저장소 루트 (모노레포 최상단) |
| `-Out` | 산출물 폴더. 기본 `<Root>\_analysis` |
| `-CommonPkg` | 공통 모듈 패키지 prefix. 예 `com.company.common`. 주면 공통 API 사용/미사용 분석까지 수행 |
| `-Exclude` | 제외 경로 정규식 배열. 기본값에 `target/ build/ bin/ .svn/ WEB-INF/lib/ backup` 포함 |

> 실행 시간: 10만 파일 기준 수 분. 진행 로그가 초 단위로 찍힌다.
> 메모리: 파일 본문은 파싱 후 즉시 버리고 요약만 유지하므로 대형 모노레포도 처리된다.

### 17.2 산출물

```
_analysis\
  00_files.csv               전체 파일 + 인코딩 + LOC
  00_encoding-summary.csv    인코딩 분포 (MS949 섞임 확인)
  00_modules.csv             빌드 모듈(pom/build.xml/.classpath) + artifactId/version/packaging/parent/규모
  00_dependencies.csv        선언된 의존성 전수 + Java21/SpringBoot3 호환성위험 + 대체방안
  00_dependency-crosscheck.csv ★ 선언만(미사용 추정) / 사용만(선언없음 = lib 직접투입 추정)
  01_thirdparty-usage.csv    서드파티 패키지별 실제 import 사용량 + 호환성위험
  02_webapps.csv             web.xml = 배포 단위 + 규모 + URL 패턴
  03_jsp-inventory.csv       JSP 전수 + 스크립틀릿라인/form/ajax/taglib/레거시위험/도달여부
  04_java-classes.csv        Java 전수 + 패키지/DB호출/세션키/트랜잭션/진입점/도달여부
  05_mapper-statements.csv   MyBatis statement 전수 + 참조테이블 + 도달여부
  05_oracle-dependency.csv   Oracle 전용 문법 15종 사용처 + 위험도 + 대체방안
  09_dead-java.csv           ★ 미참조 Java
  09_dead-jsp.csv            ★ 미참조 JSP/JSPF
  09_dead-js.csv             ★ 미참조 JS
  09_dead-statements.csv     ★ 미참조 SQL statement
  01_common-api-surface.csv  공통 모듈 public 메서드 전수      (-CommonPkg 지정 시)
  01_common-usage-index.csv  공통 모듈 사용처 역인덱스          (-CommonPkg 지정 시)
  01_common-dead-class.csv   ★ 아무도 안 쓰는 공통 클래스       (-CommonPkg 지정 시)
  01_common-method-unused.csv★ 아무도 안 쓰는 공통 메서드       (-CommonPkg 지정 시)
  99_summary.txt             규모/죽은코드비율/인코딩/Oracle 요약
```

본문 Phase의 셸 블록 ↔ 스크립트 산출물 대응:

| 본문 | Windows 대체 |
|---|---|
| Phase 0 셸 (3.1) | `00_files.csv`, `00_encoding-summary.csv`, `00_modules.csv`, `99_summary.txt` |
| Phase 0 의존성 | `00_dependencies.csv`, `00_dependency-crosscheck.csv`, `01_thirdparty-usage.csv` |
| Phase 1 셸 (4.1) | `01_*.csv` (`-CommonPkg` 필수) |
| Phase 2 셸 (5.1) | `02_webapps.csv` |
| Phase 3 셸 (6.1) | `03_jsp-inventory.csv` |
| Phase 4 셸 (7.1) | `04_java-classes.csv` (+ 프레임워크 판정은 `02_webapps.csv` URL패턴 참고) |
| Phase 5 셸 (8.1) | `05_mapper-statements.csv`, `05_oracle-dependency.csv` |
| Phase 6 셸 (9.1) | `04_java-classes.csv` 의 `세션키`/`트랜잭션` 컬럼, `03_jsp-inventory.csv` 의 `레거시위험` 컬럼 |

### 17.3 죽은 코드 판정 원리

git 이력 대신 **참조 그래프 도달성(reachability)** 으로 판정한다.

```
[Java]
  진입점(root) = web.xml/struts/spring 설정의 class 지정
               + JSP의 <%@page import%> / new Xxx() / Xxx.method()
               + main(String[]) 보유 클래스
               + 문자열 리터럴에 FQCN이 등장하는 클래스
  → 루트에서 참조를 따라 BFS 전파 → 미도달 = 09_dead-java.csv

[JSP]
  루트 = 어딘가(java 문자열/다른 jsp/xml/js)에서 파일명이 언급된 JSP + welcome-file
  → include 그래프로 BFS → 미도달 = 09_dead-jsp.csv
  (.jspf 조각이 미도달이면 삭제 확정에 가깝다. .jsp는 URL 직접 접근 가능성이 남는다)

[statement]
  statement id 또는 namespace.id 가 Java 문자열 리터럴에 한 번도 없으면 미참조

[JS]
  <script src> / import / require 로 아무도 참조하지 않으면 미참조
```

**판정 편향은 의도적으로 "살아있음" 쪽**이다. 애매하면 ALIVE로 본다.
→ 그래서 UNREACHED로 나온 것은 신뢰도가 높다. 하지만 아래 4종은 정적으로 잡히지 않으니 **반드시 교차 확인**:

1. `Class.forName(변수)` 등 문자열 조합 클래스 로딩
2. URL 직접 접근되는 JSP → **웹서버 액세스 로그**로 교차 검증 (git이 없으니 이게 유일한 실사용 증거)
3. **메뉴/프로그램 매핑 테이블** — 레거시는 화면/클래스 매핑을 DB에 두는 경우가 많다. 해당 테이블 덤프 필요
4. 외부 스케줄러(윈도우 작업 스케줄러/배치 .bat)에서만 호출되는 클래스 → `.bat`/`.cmd` 파일 별도 grep

교차 확인용 추가 명령:

```powershell
# 배치 스크립트에서 호출되는 클래스 찾기
Get-ChildItem -Recurse -Include *.bat,*.cmd,*.sh | Select-String -Pattern '[\w\.]+\.[A-Z]\w+' |
  Select-Object Path, Line | Export-Csv "_analysis\09_batch-entrypoints.csv" -NoTypeInformation -Encoding UTF8

# 액세스 로그에서 실제 호출된 URL (경로는 환경에 맞게)
Get-Content "C:\logs\access*.log" |
  Select-String -Pattern '(GET|POST)\s+(\S+)' -AllMatches |
  ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[2].Value } |
  Group-Object | Sort-Object Count -Descending |
  Export-Csv "_analysis\09_used-urls.csv" -NoTypeInformation -Encoding UTF8
```

### 17.4 죽은 코드 처리 원칙

| 판정 | 조치 |
|---|---|
| UNREACHED + 액세스 로그 0건 + 메뉴테이블 없음 | **컨버전 대상에서 제외**. 삭제는 하지 않고 목록만 남긴다 |
| UNREACHED 이지만 로그/메뉴테이블에 존재 | ALIVE로 정정. 정적 분석 사각지대 사례로 기록 |
| ALIVE | 컨버전 대상 |

> **원본 소스는 삭제하지 않는다.** git이 없으므로 되돌릴 수 없다.
> 제외 목록(`09_dead-*.csv`)만 유지하고, 컨버전 범위 산정에서만 빼는 방식으로 쓴다.

### 17.5 의존성 분석 — 빌드 실행 없이 소스만으로

빌드를 못 돌리므로 **전이 의존성(transitive)은 알 수 없다.** 알 수 있는 건 두 축뿐이고, 스크립트가 둘 다 뽑는다.

```
축1  선언 : pom.xml <dependency> / build.xml <pathelement *.jar> / .classpath <classpathentry lib>
           → 00_dependencies.csv   (groupId, artifactId, version, scope, 호환성위험, 대체방안)
축2  사용 : 전체 Java 소스의 import 문에서 우리 패키지·JDK 를 뺀 나머지
           → 01_thirdparty-usage.csv (패키지루트, 사용파일수, import건수)

축1 ∩ 축2 교차 → 00_dependency-crosscheck.csv
```

교차 결과 해석:

| 상태 | 의미 | 조치 |
|---|---|---|
| 일치 | 선언 O + 사용 O | 정상. 대체 라이브러리 매핑만 하면 됨 |
| **선언만(미사용 추정)** | 선언은 있는데 import 흔적 없음 | 제거 후보. **단 JDBC 드라이버·로깅 구현체·리플렉션 전용은 정상이므로 제외** |
| **사용만(선언없음)** | import 은 있는데 어떤 빌드파일에도 선언 없음 | **WEB-INF/lib 에 jar 직접 투입 추정.** 빌드 재구성 시 누락 → 장애. 실물 jar 파일명을 눈으로 확인해 목록에 채울 것 |

버전이 `UNKNOWN` 으로 나오는 경우 (정상이다, 추측으로 채우지 말 것):

- `${xxx.version}` 인데 해당 property 가 상위 pom 에 있음 → 상위 pom 실물 확인
- `<version>` 자체가 없음 → 부모 `dependencyManagement` 상속
- Ant/.classpath 의 jar 선언 → 파일명에 버전이 붙어 있으면 그걸로, 없으면 UNKNOWN

호환성 판정은 선언명/패키지명 매칭으로 자동 표기된다. 위험 `상` 은 **소스 수정 없이는 Java 21 / Spring Boot 3 에서 못 뜨는 것**들이다:

| 라이브러리 | 위험 | 대체 |
|---|---|---|
| `javax.servlet` / `jsp-api` / `jstl` / `javax.el` | 상 | **`jakarta.*` 전면 변경** — import 문 대량 수정, 가장 큰 기계적 작업 |
| Struts | 상 | Spring MVC. Action 클래스 직접 포팅 불가 |
| Spring 2.x/3.x | 상 | Spring Boot 3.x. XML 설정 전면 재작성 |
| iBATIS / sqlMap | 상 | MyBatis 3 (`mybatis-spring-boot-starter`). SqlMap XML 문법 변환 필요 |
| Log4j 1.x | 상 | EOL + CVE. SLF4J + Logback |
| ojdbc14 / ojdbc6 / classes12 | 상 | ojdbc11 |
| cglib / asm (구버전) | 상 | Java 21 바이트코드 미호환. 제거 또는 최신화 |
| jaxb / javax.annotation / javax.persistence | 상 | jakarta.* |
| commons-lang 2 / commons-collections 3 | 중 | lang3 / collections4 (역직렬화 CVE) |
| commons-httpclient | 중 | `java.net.http.HttpClient` (JDK 내장) |
| xerces / xalan / dom4j | 중 | JDK 내장 XML. 제거 검토 |
| Quartz 1.x, POI 3.x, json-lib | 중 | Quartz 2 / POI 5 / Jackson |
| Tiles / SiteMesh / Velocity | 중 | 서버 템플릿 제거. React 로 대체 |
| jQuery / prototype / DWR | 하 | React + fetch |

> **`javax.*` → `jakarta.*` 가 최대 물량 작업이다.** `01_thirdparty-usage.csv` 의 `javax.servlet*` 행에 찍힌
> `사용파일수` 가 곧 수정해야 할 Java 파일 수다. 이 숫자를 컨버전 공수 산정에 먼저 반영할 것.

### 17.6 LLM에게 의존성 분석을 시키는 프롬프트

```text
[분석 규칙 블록 붙일 것 — 특히 9번(빌드 금지)]

아래는 빌드 선언과 실제 import 사용량을 교차한 표다.
빌드를 실행하지 말고, jar 를 열지 말고, 이 표만 보고 판정하라.

각 행을 다음 중 하나로 판정하고 근거를 한 줄로 적어라.
  KEEP    : 그대로 유지 (최신 버전만 올리면 됨)
  REPLACE : 대체 라이브러리 필요
  REMOVE  : 제거 (JDK/Spring Boot 내장으로 흡수)
  UNKNOWN : 표만으로 판단 불가

출력 형식(행마다 한 줄, 다른 말 금지):
<artifactId 또는 패키지루트>|<KEEP/REPLACE/REMOVE/UNKNOWN>|<대체대상 또는 사유 20자 이내>

예시:
commons-lang|REPLACE|commons-lang3

표:
{00_dependency-crosscheck.csv 30행}
```

---

## 18. 저성능 모델 대응 (작은 모델로 돌릴 때)

> 전제: **모델 성능이 낮을수록 모델에게 시키는 일을 줄이고 스크립트가 하는 일을 늘린다.**
> 17장 스크립트가 "수집·집계·그래프 탐색"을 전부 끝냈으므로, 모델에게 남는 건 **분류와 명명뿐**이다.

### 18.1 역할 분리 (이게 핵심)

| 작업 | 담당 | 이유 |
|---|---|---|
| 파일 탐색, 카운트, 인코딩 판별 | **스크립트** | 모델이 하면 반드시 틀린다 |
| 참조 그래프 / 죽은 코드 | **스크립트** | 전이 폐쇄는 모델이 못 한다 |
| 테이블 추출, Oracle 문법 탐지 | **스크립트** | 정규식이 정확하다 |
| 합계·검증 | **스크립트** | 모델은 산수를 틀린다 |
| 화면 이름 짓기, React 컴포넌트명 결정 | 모델 | 판단 영역 |
| 스크립틀릿 로직 3분류 (출력/분기/비즈니스) | 모델 | 판단 영역 |
| 공통 API 5분류 (A~E) | 모델 | 판단 영역 |
| 의존성 파싱·교차검증·호환성 표기 | **스크립트** | 텍스트 매칭이면 충분 |
| 의존성 KEEP/REPLACE/REMOVE 판정 | 모델 | 판단 영역 (17.6 프롬프트) |
| 난이도 등급 사유 서술 | 모델 | 판단 영역 |

> 점수(S1~S6)는 스크립트 컬럼으로 계산 가능하다. 모델에게 계산시키지 말 것.

### 18.2 저성능 모델용 프롬프트 규칙

1. **한 프롬프트 = 한 가지 일.** "분석하고 분류하고 매핑해줘" 금지. "분류만 해" 로 쪼갠다.
2. **자유 서술 금지, 객관식으로.** 선택지를 프롬프트에 박아놓는다.
3. **입력은 20~50행 배치.** CSV 조각을 그대로 넣는다. 파일 경로가 아니라 **내용**을 넣는다 (약한 모델은 도구 사용 중 길을 잃는다).
4. **출력은 고정 포맷 1줄/행.** 설명 문장 금지.
5. **예시 1개를 항상 포함** (few-shot). 약한 모델은 포맷 예시가 있으면 급격히 안정된다.
6. **온도 0.**
7. **검증은 스크립트로.** 모델에게 "검토해봐" 라고 시키지 말 것 — 행 수, 허용값 범위를 스크립트로 검사하고 불일치 행만 재요청한다.

### 18.3 프롬프트 템플릿 (복붙용)

**(가) 스크립틀릿 3분류** — `03_jsp-inventory.csv` 에서 `스크립틀릿라인 > 0` 인 파일만 대상

```text
아래는 JSP 파일 하나의 <% %> 안에 있는 코드다. 딱 한 글자로만 답하라.

A = 화면 출력/포맷팅만 함 (값 찍기, 날짜/숫자 포맷)
B = 조건 분기나 반복만 함 (if, for)
C = 비즈니스 로직 (계산, 권한 판단, DB 접근, 외부 호출)

출력 형식(이 한 줄만, 다른 말 금지):
<파일경로>|<A 또는 B 또는 C>

예시:
/portal/user/userList.jsp|A

대상 파일: {경로}
코드:
{스크립틀릿 코드 200줄 이하}
```

**(나) 공통 API 5분류** — `01_common-api-surface.csv` 를 30행씩

```text
아래 표의 각 행을 A~E 중 하나로 분류하라. 다른 말은 쓰지 마라.

A = 순수 유틸 (문자열/날짜/숫자/암호화, 상태 없음)
B = DB 접근 공통 (Connection, DAO 기반클래스, 페이징 쿼리 생성)
C = 인증/세션/권한
D = 화면 공통 (태그, HTML 생성, 화면 문자열)
E = 프레임워크 코어 (요청 디스패치, 공통 Controller/Action 기반클래스)

출력 형식(행마다 한 줄):
<클래스>.<메서드>|<A~E>

예시:
StringUtil.nvl|A

표:
{CSV 30행}
```

**(다) 화면명 + React 컴포넌트명 부여** — `03_jsp-inventory.csv` 를 30행씩

```text
아래 각 JSP에 대해 한국어 화면명과 React 컴포넌트명을 정하라.
- 화면명: 명사구, 10자 이내
- 컴포넌트명: PascalCase 영문, 끝은 Page/Modal/Form/Grid 중 하나
- 경로만 보고 모르겠으면 화면명에 UNKNOWN 을 쓴다. 지어내지 마라.

출력 형식(행마다 한 줄):
<경로>|<화면명>|<컴포넌트명>

예시:
/portal/user/userList.jsp|사용자 목록|UserListPage

목록:
{경로 30개}
```

**(라) statement 용도 한 줄 요약** — `05_mapper-statements.csv` 를 30행씩

```text
아래 SQL statement id 를 보고 용도를 한국어 15자 이내로 쓰라.
id 만으로 모르겠으면 UNKNOWN 을 쓴다. 추측하지 마라.

출력 형식:
<전체id>|<용도>

예시:
user.selectUserList|사용자 목록 조회

목록:
{30행}
```

### 18.4 모델 출력 검증 스크립트

```powershell
# 모델이 뱉은 결과(result.txt)를 검사: 행 수 일치 + 허용값 범위
param([string]$In, [string]$Result, [string[]]$Allowed = @('A','B','C','D','E'))
$src = Import-Csv $In
$out = Get-Content $Result | Where-Object { $_ -match '\|' }
if ($out.Count -ne $src.Count) { Write-Warning ("행 수 불일치: 입력 {0} / 출력 {1}" -f $src.Count, $out.Count) }
$bad = $out | Where-Object { ($_ -split '\|')[-1].Trim() -notin $Allowed }
if ($bad) { Write-Warning "허용되지 않은 값:"; $bad | Write-Host }
else { Write-Host "검증 통과" }
```

불일치 행만 다시 모델에 넣는다. 전체 재실행하지 않는다.

### 18.5 저성능 모델일 때 건너뛰어도 되는 것

| Phase | 저성능 모델 | 대안 |
|---|---|---|
| 0 지형도 | 모델 불필요 | 스크립트 산출물 그대로 사용 |
| 1 공통 모듈 | 분류(A~E)만 시킴 | 나머지는 스크립트 |
| 2 서비스 경계 | 모델 불필요 | `02_webapps.csv` 그대로 |
| 3 화면 | 화면명/컴포넌트명/스크립틀릿분류만 | 나머지 컬럼은 스크립트 |
| 4 엔드포인트 | **어려움.** 체인 추적은 약한 모델이 못 한다 | 프레임워크 판정만 사람이 1회 하고, URL↔클래스 매핑 규칙을 스크립트에 추가하는 편이 빠르다 |
| 5 데이터 | statement 용도 요약만 | Oracle 종속은 스크립트 |
| 6 횡단 | **사람이 판단** | 스크립트가 뽑은 세션키/트랜잭션 목록을 사람이 읽는 게 빠르다 |
| 7 난이도 | 점수는 스크립트 계산 | 모델은 사유 서술만 |
| 8 매핑표 | 11장 표 그대로 사용 | 모델 불필요 |

> **Phase 4가 병목이다.** 프레임워크가 자체 MVC면 URL→클래스 매핑 규칙(설정파일/네이밍/DB테이블)을 **사람이 1회 파악**해서 `analyze.ps1`에 정규식으로 넣어라. 그러면 엔드포인트 인벤토리도 스크립트가 전수로 만들어 준다. 모델에게 수천 건의 체인 추적을 시키는 것보다 이 편이 압도적으로 싸고 정확하다.
