# 레거시 → Spring Boot 3 / React 18 컨버전 지시서 (저성능 LLM 전용)

> **입력**: `_analysis/` 의 분석 산출물 (LEGACY_ANALYSIS_GUIDE.md 로 생성)
> **출력**: 아래에 고정된 구조·템플릿을 그대로 채운 소스 파일
> **핵심 원칙**: **모델은 설계하지 않는다. 구조는 이 문서가 전부 고정한다. 모델은 빈칸만 채운다.**

> 🔸 **이 문서의 목적은 "돌아가는 코드"가 아니라 "사람이 이어받기 좋은 1차 변환본"이다.**
> 빌드·컴파일·테스트를 하지 않는다. 비즈니스 로직은 어차피 사람이 다시 짠다.
> 따라서 모델에게 요구하는 것은 단 하나: **레거시에 있던 것을 빠짐없이, 정해진 자리에 옮겨 놓기.**
> 성공 기준은 "컴파일된다"가 아니라 **"사람이 레거시를 다시 안 열어봐도 된다"** 이다.

저성능 모델로 컨버전을 성공시키는 유일한 방법은 **모델의 자유도를 0에 가깝게 만드는 것**이다.
이 문서는 디렉토리·네이밍·템플릿·순서를 전부 못 박아, 모델에게 "판단" 대신 "치환"만 시킨다.

---

## 0. 전제 조건 (하나라도 못 지키면 시작하지 말 것)

```
[ ] _analysis/04_endpoints/endpoint-inventory.csv 가 있다        → 없으면 BE 컨버전 불가
[ ] _analysis/03_screens/screen-to-react.csv 가 있다             → 없으면 FE 컨버전 불가
[ ] _analysis/05_data/mapper-statements.csv 가 있다              → 없으면 SQL 이전 불가
[ ] _analysis/09_dead-*.csv 로 제외 대상이 걸러졌다              → 죽은 코드를 컨버전하지 않기 위함
[ ] 도메인 군집(table-domain-map.md)이 확정됐다                  → 저장소 분리 기준
[ ] 빌드/네트워크는 여전히 사용하지 않는다 (분석 지시서 규칙 9)
```

---

## 1. 컨버전 절대 규칙 (모든 프롬프트 앞에 붙일 것)

```text
[컨버전 규칙 — 반드시 준수]

1. 구조를 설계하지 마라. 디렉토리·파일명·패키지명은 이 문서가 지정한 것만 쓴다.
2. 한 번에 파일 1개만 만든다. 여러 파일을 한 응답에 담지 마라.
3. 주어진 템플릿의 구조를 바꾸지 마라. {{ }} 로 표시된 빈칸만 채운다.
4. 코드 외의 문장을 출력하지 마라. 설명·요약·주의사항 금지. 코드 블록 하나만 출력한다.
5. 레거시에 없던 기능을 추가하지 마라. 필드·검증·화면요소를 상상해서 넣지 마라.
6. 레거시에 있던 기능을 빼지 마라. 파라미터 1개라도 누락되면 장애다.
7. 모르는 값은 TODO 주석으로 남긴다. 형식: // TODO(확인필요): <무엇을 확인해야 하는지>
   추측해서 채우지 마라.
8. import 는 실제 사용하는 것만 쓴다. 없는 클래스/모듈을 import 하지 마라.
9. any 금지 (TypeScript). Object/Map<String,Object> 금지 (Java).
10. 주석은 한국어. 식별자는 영어.
11. 들여쓰기 2칸. JS/TS 는 작은따옴표.
12. 컴파일 여부를 신경 쓰지 마라. 빌드하지 않는다. 사람이 이어서 고친다.
    단 그렇기 때문에 **누락은 절대 허용되지 않는다.** 컴파일 에러는 사람이 5초 만에 고치지만,
    빠진 파라미터 하나는 운영 장애가 되어 돌아온다.

13. 모든 파일 맨 위에 레거시 출처를 주석으로 남긴다. 예외 없다.
    Java/TS: // 레거시: <파일경로>:<라인>
    XML    : <!-- 레거시: <파일경로>:<라인> / statement: <id> -->

14. 옮기지 못한 것은 반드시 표시한다. 조용히 버리지 마라.
    // TODO(확인필요): <무엇을>
    // TODO(로직이관): <레거시 어디에 있던 무슨 로직인지>  ← 사람이 다시 짜야 할 부분
    // TODO(미이관): <옮기지 않은 것과 그 이유>
```

---

## 2. 저장소 분리 (MSA) — 고정

### 2.1 분리 결정 규칙

분석 산출물에서 **기계적으로** 도출한다. 모델이 정하지 않는다.

```
1. _analysis/05_data/table-domain-map.md 의 테이블 군집 = 도메인 후보
2. _analysis/02_services/service-boundary.md 의 "공유 테이블/공유 세션" 그룹은 같은 도메인으로 합친다
3. 도메인의 엔드포인트 수가 10개 미만이면 인접 도메인에 흡수시킨다 (저장소 파편화 방지)
4. 남은 도메인 1개 = BE 저장소 1개 + FE 슬라이스 1개
```

> **분리 임계치**: 도메인 3개 이하 또는 개발팀 1개면 **저장소를 쪼개지 말고 단일 저장소 + 모듈 분리**로 간다.
> MSA는 조직이 나뉘어 있을 때만 이득이다. 이 판단은 사람이 1회 하고 문서에 적는다.

### 2.2 저장소 목록 (고정)

**Backend**

| 저장소 | 역할 | 비고 |
|---|---|---|
| `platform-bom` | 의존성 버전 한 곳 고정 (Gradle version catalog) | 모든 서비스가 참조 |
| `platform-core` | 공통 라이브러리 jar: 응답 규격, 예외, 페이징, MyBatis 설정, 보안 필터 | 레거시 공통모듈 A·B분류의 후계 |
| `gateway` | Spring Cloud Gateway. 프론트는 여기만 호출 | CORS·인증 전파 단일 지점 |
| `svc-<도메인>` | 도메인별 서비스 (예: `svc-user`, `svc-order`) | 2.1 규칙으로 개수 결정 |

**Frontend**

| 저장소 | 역할 | 비고 |
|---|---|---|
| `@company/react-common-module` | **이미 존재.** 공통 UI·http·query·grid | **새로 만들지 마라. 이것을 쓴다** |
| `fe-shell` | 라우터 호스트, 레이아웃, 인증, i18n Provider | TanStack Router 루트 |
| `fe-<도메인>` | 도메인별 페이지·API·스토어. npm 패키지로 배포 | shell 이 import |

> FE 저장소를 쪼갤 만큼 팀이 나뉘지 않았다면 `fe-shell` 하나에 FSD 슬라이스로만 나눈다.
> Module Federation 은 **도입하지 않는다.** npm 패키지 합성으로 충분하고, 저성능 모델이 다루기엔 위험이 크다.

### 2.3 DB 분리는 하지 않는다 (중요)

```
저장소 분리 ≠ DB 분리.
레거시는 하나의 Oracle 을 여러 서비스가 공유한다. 이 구조를 1차 컨버전에서 바꾸지 않는다.
  - 1차: 저장소·코드만 분리. DB 스키마·테이블은 그대로. 서비스마다 같은 DataSource 를 본다.
  - 2차(이행 완료 후): 도메인별 스키마 분리 검토.
모델에게 "서비스별 DB"를 만들게 하지 마라. 데이터 정합성이 즉시 깨진다.
```

---

## 3. 타깃 스택 고정표

### Backend

| 항목 | 고정값 |
|---|---|
| 빌드 | Gradle (Kotlin DSL, `build.gradle.kts`) |
| 언어 | Java 21 |
| 프레임워크 | Spring Boot 3.x |
| 영속성 | MyBatis 3 (`mybatis-spring-boot-starter`) — **JPA 쓰지 않는다** |
| DB | Oracle (`ojdbc11`) — 레거시 SQL 재사용이 목적 |
| 보일러플레이트 | Lombok |
| API | RESTful, 응답 규격 고정 (7장) |
| 문서 | springdoc-openapi |

> 테스트 프레임워크는 지금 정하지 않는다. 1차 변환본에 테스트를 만들지 않기 때문이다.

### Frontend

| 항목 | 고정값 |
|---|---|
| 런타임 | React 18 |
| 빌드 | Vite + TypeScript |
| 라우팅 | TanStack Router **1.170** (파일 기반 라우팅) |
| 서버 상태 | TanStack Query v5 |
| 클라이언트 상태 | Zustand |
| UI | antd 5 |
| 그리드 | ag-grid **enterprise 33.2.1** |
| HTTP | axios (공통모듈 `createHttp`) |
| 다국어 | react-intl |
| 유틸 | lodash (함수 단위 import) |
| 아키텍처 | FSD (Feature-Sliced Design) |

### ⚠️ 3.1 착수 전 결정해야 할 버전 충돌 1건

```
현재 @company/react-common-module 의 선언:
  peerDependencies: ag-grid-community/enterprise/react  ^34.0.0
  dependencies    : @ag-grid-community/locale           ^34.0.0   ← 고정 의존
요청 스택        : ag-grid enterprise 33.2.1

→ 이대로 앱에서 33.2.1 을 설치하면 peer 경고 + locale 패키지 버전 불일치가 난다.
```

선택지 2개. **사람이 1회 결정하고 아래에 적는다. 모델에게 맡기지 마라.**

| 안 | 조치 | 비고 |
|---|---|---|
| **A (권장)** | 공통모듈 peer 를 `^33.2.1 \|\| ^34` 로 넓히고, `@ag-grid-community/locale` 을 peerDependencies 로 이동. 앱은 33.2.1 고정 | 공통모듈 코드 수정 최소. 요청 버전 유지 |
| B | 앱을 34.x 로 통일 | 33.2.1 을 써야 하는 이유(라이선스·검증)가 없을 때만 |

> 결정 결과: `______________` ← 여기에 적고 시작할 것.

---

## 4. Backend 디렉토리 구조 (고정)

```
svc-<도메인>/
├── build.gradle.kts
├── settings.gradle.kts
└── src
    ├── main
    │   ├── java/com/company/<도메인>/
    │   │   ├── <Domain>Application.java
    │   │   ├── config/                    # MyBatis, Web, Security 설정
    │   │   └── <업무>/                     # 업무 단위 패키지 (예: user, dept)
    │   │       ├── controller/<Xxx>Controller.java
    │   │       ├── service/<Xxx>Service.java
    │   │       ├── mapper/<Xxx>Mapper.java        # MyBatis 인터페이스
    │   │       └── dto/
    │   │           ├── <Xxx>SearchRequest.java    # record
    │   │           ├── <Xxx>SaveRequest.java      # record
    │   │           ├── <Xxx>Response.java         # record
    │   │           └── <Xxx>Row.java              # class (MyBatis 매핑 전용)
    │   └── resources/
    │       ├── application.yml
    │       └── mapper/<업무>/<Xxx>Mapper.xml
    └── test/java/com/company/<도메인>/...
```

**레이어 규칙 — 어기면 안 됨**

```
Controller  → Service       (Mapper 직접 호출 금지)
Service     → Mapper        (다른 Service 호출은 같은 저장소 안에서만)
Mapper      → XML           (Mapper 인터페이스에 SQL 어노테이션 금지)
DTO 는 레이어를 넘어다닌다. Row 는 Service 밖으로 나가지 않는다.
```

---

## 5. Frontend 디렉토리 구조 (FSD, 고정)

```
fe-shell/  또는  fe-<도메인>/
└── src
    ├── app/                         # 앱 조립. 여기만 전역을 안다
    │   ├── main.tsx
    │   ├── providers/               # QueryProvider, IntlProvider, ConfigProvider(antd)
    │   ├── routes/                  # TanStack Router 파일 기반 라우트
    │   │   ├── __root.tsx
    │   │   └── <도메인>/<화면>.tsx     # 라우트는 페이지를 import 만 한다
    │   └── routeTree.gen.ts         # 자동 생성. 손대지 마라
    ├── pages/                       # 화면 1개 = 폴더 1개
    │   └── <도메인>/<화면>/
    │       ├── ui/<Xxx>Page.tsx
    │       └── index.ts
    ├── widgets/                     # 여러 feature 를 묶은 화면 조각 (검색영역+그리드 등)
    ├── features/                    # 사용자 행위 1개 (등록, 수정, 삭제, 엑셀다운로드)
    │   └── <도메인>/<행위>/
    │       ├── ui/    model/    api/
    ├── entities/                    # 도메인 객체 + 그 조회 API
    │   └── <도메인>/
    │       ├── api/<xxx>Api.ts      # axios 호출
    │       ├── api/<xxx>Queries.ts  # useQuery / useMutation
    │       ├── model/types.ts       # 서버 응답 타입
    │       └── index.ts
    └── shared/                      # 도메인 무관
        ├── api/http.ts              # 공통모듈 createHttp 설정
        ├── config/                  # env, 상수
        ├── i18n/ko.json
        └── lib/
```

**FSD 의존 방향 — 어기면 안 됨**

```
app → pages → widgets → features → entities → shared
위에서 아래로만 import 한다. 역방향 import 금지. 같은 레이어끼리 import 금지.
(예: entities 가 features 를 import 하면 잘못이다)
```

**공통 UI 는 만들지 않는다.** 그리드·모달·폼·인풋·셀렉트는 전부 `@company/react-common-module` 에 있다.

```ts
import {
  CommonGrid, CommonModal, confirmModal, CommonForm, FormField,
  CommonInput, CommonSelect,
  createHttp, setHttp, getHttp, isApiError, type ApiResponse,
  QueryProvider, createQueryClient,
  useGridStore, exportGridToExcel,
} from '@company/react-common-module';
```

---

## 6. 네이밍 규칙 (기계적 도출 — 모델이 정하지 않는다)

분석 산출물의 값에서 **계산**한다.

| 대상 | 규칙 | 예 |
|---|---|---|
| 업무 패키지 | 레거시 URL 2번째 세그먼트 소문자 | `/portal/user/list.do` → `user` |
| Controller | `<업무 PascalCase>Controller` | `UserController` |
| Service | `<업무>Service` | `UserService` |
| Mapper IF | `<업무>Mapper` | `UserMapper` |
| Mapper XML | `resources/mapper/<업무>/<업무>Mapper.xml` | `mapper/user/UserMapper.xml` |
| REST 경로 | `/api/v1/<업무 복수형 kebab>` | `/api/v1/users` |
| 조회 Request | `<화면>SearchRequest` | `UserSearchRequest` |
| 저장 Request | `<화면>SaveRequest` | `UserSaveRequest` |
| 응답 | `<화면>Response` | `UserResponse` |
| MyBatis Row | `<화면>Row` | `UserRow` |
| FE 라우트 | `/<업무>` + 화면 | `/users`, `/users/$userId` |
| FE 페이지 | `<화면>Page` | `UserListPage` |
| FE API 함수 | `fetch<화면>List`, `save<화면>`, `remove<화면>` | `fetchUserList` |
| FE 쿼리키 | `['<업무>', '<동작>', params]` | `['user','list',params]` |
| i18n 메시지 id | `<업무>.<화면>.<키>` | `user.list.title` |

**HTTP 메서드 결정 규칙 (레거시 URL 접미사 기준)**

| 레거시 | 타깃 |
|---|---|
| `*List.do`, `*Search.do`, `*View.do`, `*Detail.do` | `GET` |
| `*Insert.do`, `*Save.do`, `*Reg.do` | `POST` |
| `*Update.do`, `*Modify.do` | `PUT` |
| `*Delete.do`, `*Remove.do` | `DELETE` |
| 판단 불가 | `POST` + `// TODO(확인필요): HTTP 메서드` |

---

## 7. 공통 응답 / 에러 규격 (고정)

**프론트 공통모듈이 이미 이 형태를 기대한다. 바꾸지 마라.**

```java
// platform-core : com.company.core.web.ApiResponse
public record ApiResponse<T>(String code, String message, T data) {
  public static <T> ApiResponse<T> ok(T data) {
    return new ApiResponse<>("OK", "", data);
  }
  public static <T> ApiResponse<T> fail(String code, String message) {
    return new ApiResponse<>(code, message, null);
  }
}
```

```java
// platform-core : 페이징 응답
public record PageResponse<T>(
    List<T> content, int page, int size, long totalElements, int totalPages) {
  public static <T> PageResponse<T> of(List<T> content, int page, int size, long total) {
    int totalPages = size == 0 ? 0 : (int) Math.ceil((double) total / size);
    return new PageResponse<>(content, page, size, total, totalPages);
  }
}
```

```java
// platform-core : 전역 예외 처리. 서비스마다 만들지 마라
@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(BusinessException.class)
  public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
    return ResponseEntity.status(e.getStatus())
        .body(ApiResponse.fail(e.getCode(), e.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiResponse<Void>> handleValid(MethodArgumentNotValidException e) {
    String msg = e.getBindingResult().getFieldErrors().stream()
        .map(f -> f.getField() + ": " + f.getDefaultMessage())
        .collect(Collectors.joining(", "));
    return ResponseEntity.badRequest().body(ApiResponse.fail("INVALID_INPUT", msg));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiResponse<Void>> handleEtc(Exception e) {
    log.error("처리되지 않은 예외", e);
    return ResponseEntity.internalServerError()
        .body(ApiResponse.fail("INTERNAL_ERROR", "서버 오류가 발생했습니다."));
  }
}
```

프론트는 `res.data.data` 로 꺼낸다. 실패는 공통모듈 인터셉터가 `ApiError(status, code, message)` 로 바꿔 던진다.

---

## 8. 변환 순서 (기능 1개당 12단계, 순서 고정)

**앞 단계 산출물이 뒤 단계의 입력이다. 순서를 바꾸면 모델이 헤맨다.**

```
BE-1  Mapper XML          ← 레거시 SQL 이식 (가장 먼저. 여기서 컬럼이 확정된다)
BE-2  <Xxx>Row.java       ← Mapper XML 의 select 컬럼에서 도출
BE-3  <Xxx>Mapper.java    ← Mapper XML 의 statement id 에서 도출
BE-4  <Xxx>Request.java   ← 레거시 파라미터에서 도출
BE-5  <Xxx>Response.java  ← Row 에서 화면에 필요한 것만
BE-6  <Xxx>Service.java   ← Mapper 호출 + Row→Response 변환
BE-7  <Xxx>Controller.java
FE-1  model/types.ts      ← BE-5 Response 를 그대로 TS 타입으로
FE-2  api/<xxx>Api.ts     ← BE-7 Controller 경로 그대로
FE-3  api/<xxx>Queries.ts
FE-4  ui/<Xxx>Page.tsx    ← 레거시 JSP 화면 구조 그대로
FE-5  app/routes/...tsx
```

---

## 9. Backend 골든 템플릿

### 9.1 Mapper XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
  "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.company.{{도메인}}.{{업무}}.mapper.{{Xxx}}Mapper">

  <!-- 레거시: {{레거시 mapper 경로}}:{{라인}} / statement: {{레거시 statement id}} -->
  <select id="selectList" resultType="com.company.{{도메인}}.{{업무}}.dto.{{Xxx}}Row">
    SELECT
      {{컬럼 목록 — 레거시 SQL 그대로}}
    FROM {{테이블}}
    <where>
      <if test="{{조건}} != null and {{조건}} != ''">
        AND {{컬럼}} = #{ {{조건}} }
      </if>
    </where>
    ORDER BY {{정렬 — 레거시 그대로}}
    OFFSET #{offset} ROWS FETCH NEXT #{size} ROWS ONLY
  </select>

  <select id="selectListCount" resultType="long">
    SELECT COUNT(1) FROM {{테이블}}
    <where>
      <!-- selectList 의 where 와 반드시 동일하게 유지 -->
    </where>
  </select>

</mapper>
```

### 9.2 Row (MyBatis 매핑 전용)

```java
package com.company.{{도메인}}.{{업무}}.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** MyBatis 결과 매핑 전용. Service 밖으로 내보내지 않는다. */
@Getter
@Setter
@NoArgsConstructor
public class {{Xxx}}Row {
  {{컬럼마다: private <타입> <camelCase 컬럼>;}}
}
```

### 9.3 Mapper 인터페이스

```java
package com.company.{{도메인}}.{{업무}}.mapper;

import com.company.{{도메인}}.{{업무}}.dto.{{Xxx}}Row;
import com.company.{{도메인}}.{{업무}}.dto.{{Xxx}}SearchRequest;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface {{Xxx}}Mapper {
  List<{{Xxx}}Row> selectList(@Param("req") {{Xxx}}SearchRequest req,
                              @Param("offset") int offset,
                              @Param("size") int size);
  long selectListCount(@Param("req") {{Xxx}}SearchRequest req);
}
```

### 9.4 Request / Response (record + Bean Validation)

```java
package com.company.{{도메인}}.{{업무}}.dto;

import jakarta.validation.constraints.*;

public record {{Xxx}}SearchRequest(
    {{검색조건마다: <타입> <이름>,}}
    @Min(0) int page,
    @Min(1) @Max(1000) int size
) {
  public {{Xxx}}SearchRequest {
    if (size == 0) size = 20;   // 기본 페이지 크기
  }
  public int offset() { return page * size; }
}
```

```java
package com.company.{{도메인}}.{{업무}}.dto;

public record {{Xxx}}Response(
    {{화면에 쓰는 필드만: <타입> <이름>,}}
) {
  public static {{Xxx}}Response from({{Xxx}}Row row) {
    return new {{Xxx}}Response({{row.getXxx(), ...}});
  }
}
```

### 9.5 Service

```java
package com.company.{{도메인}}.{{업무}}.service;

import com.company.core.web.PageResponse;
import com.company.{{도메인}}.{{업무}}.dto.*;
import com.company.{{도메인}}.{{업무}}.mapper.{{Xxx}}Mapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class {{Xxx}}Service {

  private final {{Xxx}}Mapper {{xxx}}Mapper;

  @Transactional(readOnly = true)
  public PageResponse<{{Xxx}}Response> getList({{Xxx}}SearchRequest req) {
    long total = {{xxx}}Mapper.selectListCount(req);
    List<{{Xxx}}Response> content = {{xxx}}Mapper
        .selectList(req, req.offset(), req.size())
        .stream()
        .map({{Xxx}}Response::from)
        .toList();
    return PageResponse.of(content, req.page(), req.size(), total);
  }
}
```

### 9.6 Controller

```java
package com.company.{{도메인}}.{{업무}}.controller;

import com.company.core.web.ApiResponse;
import com.company.core.web.PageResponse;
import com.company.{{도메인}}.{{업무}}.dto.*;
import com.company.{{도메인}}.{{업무}}.service.{{Xxx}}Service;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/{{경로}}")
@RequiredArgsConstructor
public class {{Xxx}}Controller {

  private final {{Xxx}}Service {{xxx}}Service;

  /** 레거시: {{레거시 URL}} ({{레거시 핸들러 파일:라인}}) */
  @GetMapping
  public ApiResponse<PageResponse<{{Xxx}}Response>> getList(@Valid @ModelAttribute {{Xxx}}SearchRequest req) {
    return ApiResponse.ok({{xxx}}Service.getList(req));
  }
}
```

---

## 10. Backend 프롬프트 (복붙용)

> 각 프롬프트는 **1장의 컨버전 규칙 블록을 먼저 붙인 뒤** 사용한다.
> `{{ }}` 는 사람이(또는 스크립트가) 티켓에서 채워 넣는다. 모델에게 파일을 찾게 시키지 마라 — **내용을 붙여 넣어라.**

### BE-1. Mapper XML

```text
[컨버전 규칙 블록]

아래 레거시 SQL 을 MyBatis 3 Mapper XML 로 옮겨라.

[규칙]
- SQL 본문(SELECT 절, 테이블, 조인, WHERE 조건, ORDER BY)은 한 글자도 바꾸지 마라.
- 바꾸는 것은 문법 껍데기뿐이다. 아래 치환표만 적용한다:
  #value#          → #{value}
  $value$          → ${value}          (정렬 컬럼 등 식별자 자리에만)
  <isNotEmpty prepend="AND" property="x">  → <if test="x != null and x != ''">AND
  <isNotNull property="x">                 → <if test="x != null">
  <isEqual property="x" compareValue="1">  → <if test="x == '1'">
  <iterate property="list" open="(" close=")" conjunction=",">
                                           → <foreach collection="list" item="item" open="(" separator="," close=")">
  parameterClass / resultClass             → parameterType / resultType
- 페이징이 ROWNUM 인라인뷰면 그대로 두어라. 바꾸지 마라. (결과 순서가 달라진다)
  단 Oracle 12c 이상이고 레거시 쿼리가 단순 ROWNUM <= N 이면 OFFSET/FETCH 로 바꿔도 된다.
- Oracle 함수(DECODE, NVL, TO_CHAR, CONNECT BY 등)는 그대로 둔다. Oracle 을 계속 쓴다.
- 목록 쿼리를 옮길 때는 count 쿼리도 같이 만든다. WHERE 절은 목록과 완전히 동일해야 한다.
- 맨 위에 레거시 출처를 주석으로 남긴다.

[출력]
XML 코드 블록 1개만. 설명 금지.

[namespace]
com.company.{{도메인}}.{{업무}}.mapper.{{Xxx}}Mapper

[resultType]
com.company.{{도메인}}.{{업무}}.dto.{{Xxx}}Row

[레거시 출처]
{{파일경로}}:{{라인}}  statement id: {{id}}

[레거시 SQL]
{{원본 statement 전체}}
```

### BE-2. Row 클래스

```text
[컨버전 규칙 블록]

아래 MyBatis Mapper XML 의 SELECT 절만 보고 Row 클래스를 만들어라.

[규칙]
- SELECT 절에 나온 컬럼(별칭이 있으면 별칭)만 필드로 만든다. 더 넣지 마라.
- 컬럼명 UPPER_SNAKE → 필드명 camelCase.
- 타입 매핑: VARCHAR2/CHAR/CLOB→String, NUMBER(정수)→Long, NUMBER(소수)→BigDecimal,
             DATE/TIMESTAMP→LocalDateTime, 날짜만이면 LocalDate.
  COUNT/SUM 등 집계→Long 또는 BigDecimal.
  타입을 모르면 String 으로 두고 그 줄에 // TODO(확인필요): 컬럼 타입 을 붙인다.
- record 를 쓰지 마라. class + @Getter @Setter @NoArgsConstructor 로 만든다. (MyBatis 매핑 때문)

[출력]
Java 코드 블록 1개만.

[패키지] com.company.{{도메인}}.{{업무}}.dto
[클래스명] {{Xxx}}Row

[Mapper XML]
{{BE-1 결과}}
```

### BE-3. Mapper 인터페이스

```text
[컨버전 규칙 블록]

아래 Mapper XML 의 statement 마다 메서드를 1개씩 만들어라. 그 이상도 이하도 만들지 마라.

[규칙]
- 메서드명 = statement id. 그대로.
- 반환: select 여러 건 → List<Row>, 한 건 → Row, count → long, insert/update/delete → int.
- 파라미터가 2개 이상이면 전부 @Param 을 붙인다.
- @Mapper 어노테이션을 클래스에 붙인다. SQL 어노테이션(@Select 등)은 절대 쓰지 마라.

[출력] Java 코드 블록 1개만.

[패키지] com.company.{{도메인}}.{{업무}}.mapper
[인터페이스명] {{Xxx}}Mapper

[Mapper XML]
{{BE-1 결과}}
```

### BE-4. Request

```text
[컨버전 규칙 블록]

레거시 화면이 서버로 보내던 파라미터 목록을 보고 Request record 를 만들어라.

[규칙]
- 목록에 있는 파라미터만 넣는다. 추가 금지.
- 조회용이면 끝에 int page, int size 를 넣고 offset() 메서드를 만든다.
- 저장용이면 page/size 를 넣지 않는다.
- 필수 파라미터에는 @NotNull 또는 @NotBlank 를 붙인다. 레거시 JS 검증에 있던 것만.
- 레거시에 있던 길이 제한이 있으면 @Size(max=N) 으로 옮긴다. 없으면 붙이지 마라.
- record 로 만든다. Lombok 을 쓰지 마라.

[출력] Java 코드 블록 1개만.

[패키지] com.company.{{도메인}}.{{업무}}.dto
[레코드명] {{Xxx}}SearchRequest
[종류] 조회

[레거시 파라미터 목록]
{{endpoint-inventory.csv 의 요청파라미터 컬럼}}

[레거시 화면 JS 검증 코드]
{{있으면 붙이고, 없으면 "없음"}}
```

### BE-5 ~ BE-7

```text
[컨버전 규칙 블록]

아래 템플릿의 {{ }} 만 채워라. 템플릿 구조를 바꾸지 마라.

[출력] Java 코드 블록 1개만.

[템플릿]
{{9.4 Response / 9.5 Service / 9.6 Controller 중 해당 템플릿 원문}}

[채울 값]
도메인: {{}}   업무: {{}}   Xxx: {{}}   경로: {{}}
레거시 URL: {{}}   레거시 핸들러: {{파일:라인}}
Row 클래스:
{{BE-2 결과}}
Mapper 인터페이스:
{{BE-3 결과}}
Request:
{{BE-4 결과}}
```

---

## 11. SQL 변환 규칙 (Oracle 유지, iBATIS → MyBatis 3)

### 11.1 문법 치환표 (기계적)

| 레거시(iBATIS 2.x) | MyBatis 3 |
|---|---|
| `#value#` | `#{value}` |
| `$value$` | `${value}` — **식별자 자리에만.** 값 자리에 쓰면 SQL 인젝션 |
| `parameterClass=` / `resultClass=` | `parameterType=` / `resultType=` |
| `<isNotEmpty property="x" prepend="AND">` | `<if test="x != null and x != ''">AND` |
| `<isNotNull property="x">` | `<if test="x != null">` |
| `<isEqual property="x" compareValue="1">` | `<if test="x == '1'">` |
| `<isGreaterThan property="x" compareValue="0">` | `<if test="x > 0">` |
| `<iterate property="list" ...>` | `<foreach collection="list" item="item" ...>` |
| `<dynamic prepend="WHERE">` | `<where>` |
| `<selectKey resultClass="..." keyProperty="...">` | `<selectKey keyProperty="..." resultType="..." order="BEFORE">` |
| `<sql id>` / `<include refid>` | 동일 (그대로) |

### 11.2 Oracle 문법 — 그대로 둔다

```
Oracle 을 계속 쓴다. 아래는 변환하지 마라:
  DECODE, NVL, NVL2, TO_CHAR, TO_DATE, TRUNC, SYSDATE, DUAL, MERGE INTO,
  LISTAGG, 분석함수(OVER), CONNECT BY, START WITH, 시퀀스 NEXTVAL
변환하면 결과가 달라지고, 검증할 방법이 없다.
```

예외 2가지만 정리한다:

| 대상 | 조치 | 이유 |
|---|---|---|
| `(+)` 구식 외부조인 | ANSI `LEFT JOIN` 으로 변경 | 가독성. **단 결과 건수를 반드시 비교 검증** |
| `ROWNUM` 인라인뷰 페이징 | 12c 이상이면 `OFFSET ? ROWS FETCH NEXT ? ROWS ONLY` | 정렬 안정성. 11g면 그대로 둔다 |

### 11.3 프로시저 호출

```
프로시저는 1차 컨버전에서 그대로 호출한다. Java 로 옮기지 마라.

<select id="callXxx" statementType="CALLABLE" parameterType="map">
  { call PKG_XXX.SP_XXX(
      #{p1, mode=IN, jdbcType=VARCHAR},
      #{p2, mode=OUT, jdbcType=NUMERIC}
  ) }
</select>

프로시저 소스가 없으면 파라미터 순서/타입을 추측하지 마라.
// TODO(확인필요): 프로시저 PKG_XXX.SP_XXX 의 파라미터 규격 — DBA 확인 필요
```

---

## 12. Frontend 골든 템플릿

### 12.1 shared/api/http.ts (앱당 1개, 최초 1회만)

```ts
import { createHttp, setHttp } from '@company/react-common-module';
import { useAuthStore } from '@/shared/model/authStore';

export const http = createHttp({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().clear(),
});

setHttp(http);
```

### 12.2 entities/<도메인>/model/types.ts

```ts
/** BE {{Xxx}}Response 와 1:1. 서버 규격이 바뀌면 여기만 고친다 */
export interface {{Xxx}} {
  {{필드마다: <이름>: <타입>;}}
}

export interface {{Xxx}}SearchParams {
  {{검색조건마다: <이름>?: <타입>;}}
  page: number;
  size: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
```

### 12.3 entities/<도메인>/api/<xxx>Api.ts

```ts
import { getHttp, type ApiResponse } from '@company/react-common-module';
import type { {{Xxx}}, {{Xxx}}SearchParams, PageResponse } from '../model/types';

const BASE = '/api/v1/{{경로}}';

export async function fetch{{Xxx}}List(
  params: {{Xxx}}SearchParams,
): Promise<PageResponse<{{Xxx}}>> {
  const { data } = await getHttp().get<ApiResponse<PageResponse<{{Xxx}}>>>(BASE, { params });
  return data.data;
}

export async function save{{Xxx}}(payload: {{Xxx}}): Promise<void> {
  await getHttp().post<ApiResponse<void>>(BASE, payload);
}
```

### 12.4 entities/<도메인>/api/<xxx>Queries.ts

```ts
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetch{{Xxx}}List, save{{Xxx}} } from './{{xxx}}Api';
import type { {{Xxx}}SearchParams } from '../model/types';

export const {{xxx}}Keys = {
  all: ['{{업무}}'] as const,
  list: (params: {{Xxx}}SearchParams) => [...{{xxx}}Keys.all, 'list', params] as const,
};

export function use{{Xxx}}List(params: {{Xxx}}SearchParams) {
  return useQuery({
    queryKey: {{xxx}}Keys.list(params),
    queryFn: () => fetch{{Xxx}}List(params),
    placeholderData: keepPreviousData,   // 페이지 이동 시 깜빡임 방지
  });
}

export function useSave{{Xxx}}() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: save{{Xxx}},
    onSuccess: () => { void qc.invalidateQueries({ queryKey: {{xxx}}Keys.all }); },
  });
}
```

### 12.5 pages/<도메인>/<화면>/ui/<Xxx>Page.tsx

```tsx
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button, Space } from 'antd';
import { CommonGrid, CommonInput } from '@company/react-common-module';
import type { ColDef } from 'ag-grid-community';
import { use{{Xxx}}List } from '@/entities/{{업무}}';
import type { {{Xxx}}, {{Xxx}}SearchParams } from '@/entities/{{업무}}';

const PAGE_SIZE = 20;

export function {{Xxx}}Page() {
  const intl = useIntl();
  const [params, setParams] = useState<{{Xxx}}SearchParams>({ page: 0, size: PAGE_SIZE });
  const { data, isLoading } = use{{Xxx}}List(params);

  // 레거시 {{JSP 경로}} 의 테이블 헤더 순서를 그대로 유지한다
  const columnDefs: ColDef<{{Xxx}}>[] = [
    {{컬럼마다: { field: '<필드>', headerName: intl.formatMessage({ id: '{{업무}}.{{화면}}.<필드>' }) },}}
  ];

  return (
    <div className="p-4">
      <Space className="mb-3">
        {{검색조건마다: <CommonInput ... />}}
        <Button type="primary" onClick={() => setParams((p) => ({ ...p, page: 0 }))}>
          {intl.formatMessage({ id: 'common.search' })}
        </Button>
      </Space>

      <CommonGrid<{{Xxx}}>
        rowData={data?.content ?? []}
        columnDefs={columnDefs}
        loading={isLoading}
      />
    </div>
  );
}
```

> `CommonGrid` 의 실제 props 는 `@company/react-common-module` 의 `CommonGridProps` 를 따른다.
> **모델에게 props 를 상상하게 하지 마라.** 프롬프트에 `CommonGridProps` 타입 정의를 붙여 넣는다.

### 12.6 app/routes/<도메인>/<화면>.tsx (TanStack Router 1.170, 파일 기반)

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { {{Xxx}}Page } from '@/pages/{{업무}}/{{화면}}';

export const Route = createFileRoute('/{{업무}}/{{화면}}')({
  component: {{Xxx}}Page,
});
```

```ts
// vite.config.ts — 라우트 자동 생성. routeTree.gen.ts 는 손대지 마라
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [TanStackRouterVite({ routesDirectory: './src/app/routes' }), react()],
  resolve: { alias: { '@': '/src' } },
});
```

---

## 13. Frontend 프롬프트 (복붙용)

### FE-1. 타입

```text
[컨버전 규칙 블록]

아래 Java record 를 TypeScript 인터페이스로 바꿔라.

[타입 매핑]
String→string / Long,Integer,int,long→number / BigDecimal→number
Boolean,boolean→boolean / LocalDate,LocalDateTime→string  (ISO 문자열로 온다)
List<T>→T[] / null 가능 필드→ `?:` 또는 `| null`
enum→ 유니온 리터럴 타입

[규칙]
- any 금지. unknown 도 쓰지 마라.
- 필드 개수가 Java record 와 정확히 같아야 한다.
- 주석으로 대응하는 Java 클래스명을 남긴다.

[출력] TypeScript 코드 블록 1개만.

[Java Response]
{{BE-5 결과}}
[Java Request]
{{BE-4 결과}}
```

### FE-2 / FE-3. API / Query

```text
[컨버전 규칙 블록]

아래 템플릿의 {{ }} 만 채워라. 구조 변경 금지.

[출력] TypeScript 코드 블록 1개만.

[템플릿]
{{12.3 또는 12.4 템플릿 원문}}

[채울 값]
업무: {{}}   Xxx: {{}}   경로: {{}}
[Controller — URL 과 메서드는 여기서만 가져온다]
{{BE-7 결과}}
[타입]
{{FE-1 결과}}
```

### FE-4. 페이지

```text
[컨버전 규칙 블록]

레거시 JSP 화면을 React 페이지로 옮겨라.

[규칙 — 이것만 지키면 된다]
1. 화면 요소의 "순서"와 "개수"를 레거시와 동일하게 유지한다. 임의로 재배치하지 마라.
2. 그리드 컬럼은 레거시 <table> 의 <th> 순서 그대로, 개수도 그대로.
3. 레거시 JSP 안의 <% %> 비즈니스 로직은 여기에 옮기지 마라.
   이미 백엔드 API 로 옮겼다. 화면에서는 API 결과만 그린다.
   옮길 곳이 애매하면 // TODO(확인필요): 로직 이관 위치 를 남긴다.
4. UI 컴포넌트를 직접 만들지 마라. 아래 목록에서만 골라 쓴다:
   CommonGrid, CommonModal, confirmModal, CommonForm, FormField,
   CommonInput, CommonSelect  (전부 @company/react-common-module)
   목록에 없는 것이 필요하면 antd 에서 가져온다. 그래도 없으면
   // TODO(확인필요): 공통 컴포넌트 필요 를 남긴다.
5. 화면에 보이는 모든 한국어 문자열은 intl.formatMessage({ id: '...' }) 로 감싼다.
   id 규칙: {{업무}}.{{화면}}.<키>
6. 서버 데이터는 useQuery 로만 가져온다. useState 에 서버 데이터를 담지 마라.
7. useEffect 로 데이터를 가져오지 마라. TanStack Query 가 한다.

[출력] TSX 코드 블록 1개만.

[템플릿]
{{12.5 템플릿 원문}}

[CommonGrid props 타입 — 이 타입에 있는 prop 만 써라]
{{CommonGridProps 정의 붙여넣기}}

[레거시 JSP]
{{원본 JSP 전체 — 300줄 넘으면 <table> 과 <form> 부분만}}

[사용할 쿼리 훅]
{{FE-3 결과}}
```

### FE-5. 라우트

```text
[컨버전 규칙 블록]

아래 템플릿의 {{ }} 만 채워라. 파일 1개, 4줄짜리다. 다른 것을 추가하지 마라.

[템플릿]
{{12.6 템플릿 원문}}

업무: {{}}   화면: {{}}   Xxx: {{}}
```

---

## 14. ag-grid Enterprise 33.2.1 — 고정 보일러플레이트

> v33 부터 **모듈 등록이 필수**다. 등록하지 않으면 그리드가 빈 화면으로 뜨고 콘솔에만 경고가 찍힌다.
> 저성능 모델이 가장 자주 빠뜨리는 부분이므로, **앱 진입점에 아래를 고정으로 넣고 모델에게 건드리지 못하게 한다.**

```ts
// src/app/providers/agGridSetup.ts  ← 앱당 1개. 모델이 수정하지 않는다
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
```

```ts
// main.tsx 에서 가장 먼저 import
import './app/providers/agGridSetup';
```

**테마** — v33 은 Theming API 가 기본이다. 기존 CSS 테마를 쓰려면 명시적으로 legacy 를 지정해야 한다.

```tsx
// (가) Theming API (권장)
import { themeQuartz } from 'ag-grid-community';
<AgGridReact theme={themeQuartz} ... />

// (나) 기존 CSS 테마를 유지해야 할 때
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
<div className="ag-theme-quartz">
  <AgGridReact theme="legacy" ... />
</div>
```

> (가)와 (나)를 **섞지 마라.** 섞으면 스타일이 이중 적용돼 깨진다. 앱 전체에서 하나만 고른다.

**한국어 로케일**

```ts
import { AG_GRID_LOCALE_KR } from '@ag-grid-community/locale';
<AgGridReact localeText={AG_GRID_LOCALE_KR} ... />
```

> `@ag-grid-community/locale` 버전을 ag-grid 본체와 **같은 메이저로** 맞춘다. (3.1의 버전 충돌 결정 참고)

**서버사이드 페이징** — 레거시 목록 화면의 기본형

```tsx
<CommonGrid<{{Xxx}}>
  rowData={data?.content ?? []}
  columnDefs={columnDefs}
  loading={isLoading}
  pagination
  paginationPageSize={PAGE_SIZE}
  suppressPaginationPanel        // 페이지 이동은 서버 params 로 처리
/>
```

> 레거시가 이미 서버 페이징이었다면 **클라이언트 페이징으로 바꾸지 마라.** 데이터 양을 감당 못 한다.

**엑셀 내보내기** — 공통모듈에 이미 있다. 새로 만들지 마라.

```ts
import { exportGridToExcel } from '@company/react-common-module';
```

---

## 15. 상태 관리 / i18n 규칙 (저성능 모델이 가장 많이 틀리는 곳)

### 15.1 서버 상태 vs 클라이언트 상태

```
서버에서 온 데이터 → TanStack Query. 끝.
  - useState 에 담지 마라
  - zustand 에 담지 마라
  - useEffect 로 fetch 하지 마라

zustand 에 담는 것은 오직 이것뿐:
  - 로그인 토큰 / 사용자 정보
  - 좌측 메뉴 접힘 상태 같은 전역 UI 상태
  - 여러 화면이 공유하는 검색조건 (같은 화면 안에서만 쓰면 useState 로 충분)

한 화면 안에서만 쓰는 값 → useState. zustand 로 올리지 마라.
```

판정표:

| 데이터 | 담는 곳 |
|---|---|
| 목록 조회 결과 | TanStack Query |
| 상세 조회 결과 | TanStack Query |
| 검색 폼 입력값 (화면 내) | useState |
| 그리드 선택 행 | useState (또는 공통모듈 `useGridStore`) |
| 로그인 토큰 | zustand |
| 모달 열림 여부 | useState |
| 다국어 현재 언어 | zustand |

### 15.2 react-intl

```tsx
// app/providers/IntlProvider.tsx — 앱당 1개
import { IntlProvider } from 'react-intl';
import ko from '@/shared/i18n/ko.json';

<IntlProvider locale="ko" defaultLocale="ko" messages={ko}>
  {children}
</IntlProvider>
```

```json
// shared/i18n/ko.json — id 는 <업무>.<화면>.<키>
{
  "common.search": "조회",
  "common.save": "저장",
  "common.delete": "삭제",
  "user.list.title": "사용자 목록",
  "user.list.userName": "사용자명"
}
```

```
규칙:
- 화면에 보이는 한국어 문자열은 전부 formatMessage 로 감싼다.
- id 를 모델이 새로 짓게 하지 말고, 규칙대로 기계적으로 만든다.
- ko.json 은 모델이 아니라 스크립트가 병합한다. 모델은 id 만 쓴다.
- 서버가 내려주는 메시지(ApiError.message)는 번역하지 마라. 그대로 보여준다.
```

### 15.3 lodash

```ts
// 함수 단위로만 import. 번들 크기 때문이다
import get from 'lodash/get';
import debounce from 'lodash/debounce';

// 금지
import _ from 'lodash';
import { get } from 'lodash';
```

---

## 16. 레거시 → 타깃 기계적 치환표

프롬프트에 이 표를 붙여 주면 저성능 모델의 정확도가 크게 올라간다.

| 레거시 | 타깃 |
|---|---|
| `request.getParameter("x")` | Request record 의 필드 `x` |
| `request.setAttribute("x", v)` + JSP 출력 | Response record 의 필드 |
| `session.getAttribute("userId")` | `@AuthenticationPrincipal` 또는 인증 컨텍스트 |
| `response.sendRedirect(...)` | FE 라우터 `navigate({ to: '...' })` |
| `forward("/xxx.jsp")` | FE 라우트 + 별도 조회 GET API |
| `out.println(...)` | 제거. 화면은 React 가 그린다 |
| `<c:forEach items>` | `.map()` 또는 ag-grid `rowData` |
| `<c:if test>` | JSX 조건부 렌더링 `{cond && ...}` |
| `<c:out value>` | `{value}` |
| `<fmt:formatDate>` | `intl.formatDate()` 또는 dayjs |
| `$.ajax({url, data, success})` | `useQuery` / `useMutation` |
| `document.getElementById('f').submit()` | `mutate(payload)` |
| `alert('...')` | antd `message.error(...)` |
| `confirm('...')` | 공통모듈 `confirmModal(...)` |
| `window.open(popup)` | 공통모듈 `CommonModal` |
| `HashMap<String,Object>` 반환 | Response record |
| `List<Map<String,Object>>` | `List<XxxRow>` |
| 수동 `conn.commit()/rollback()` | `@Transactional` |
| `try { } catch(Exception e) { e.printStackTrace(); }` | 삭제. 전역 예외 처리기가 받는다 |
| `System.out.println` | `log.debug` (Lombok `@Slf4j`) |
| `SimpleDateFormat` | `DateTimeFormatter` |
| `new Date()` | `LocalDateTime.now()` |
| `StringUtil.nvl(x, "")` | `Objects.requireNonNullElse(x, "")` |
| `Vector` / `Hashtable` | `ArrayList` / `HashMap` |

---

## 17. 금지 목록 (모델 실패 패턴)

| 하지 말 것 | 결과 |
|---|---|
| 한 응답에 여러 파일 출력 | 파일 경계가 깨지고 저장 자동화 불가 |
| 디렉토리 구조를 스스로 설계 | 저장소마다 구조가 달라져 유지 불가 |
| 레거시에 없던 필드·검증·버튼 추가 | 요건 오염. 리뷰 비용 폭증 |
| `Map<String,Object>` 로 응답 | 타입 안정성 상실. FE 에서 any 전파 |
| `any` / `as unknown as` | TS 도입 의미 소멸 |
| record 를 MyBatis resultType 으로 지정 | 매핑 실패. 반드시 Row class |
| Controller 에서 Mapper 직접 호출 | 트랜잭션 경계 붕괴 |
| 서비스마다 `@RestControllerAdvice` 작성 | 응답 규격 분열. platform-core 에 1개만 |
| `useEffect` + `fetch` 로 데이터 조회 | 중복 요청·경쟁 상태. Query 를 쓸 것 |
| 서버 데이터를 `useState`/zustand 에 복사 | 캐시 무효화 불가. 화면이 갱신되지 않음 |
| ag-grid 모듈 등록 누락 | 그리드가 빈 화면. 원인 파악에 시간 소모 |
| Oracle 함수를 표준 SQL 로 "개선" | 결과가 달라짐. 검증 불가 |
| 프로시저를 Java 로 재작성 | 1차 컨버전 범위 초과. 장애 위험 |
| 서비스별 DB 분리 | 데이터 정합성 붕괴 |
| 모르는 값을 그럴듯하게 채움 | 가장 위험. 반드시 `// TODO(확인필요):` |

---

## 18. 인계 체크리스트 (빌드·테스트 안 함)

**빌드하지 않는다. 컴파일 에러는 사람이 고친다. 여기서 볼 것은 딱 하나 — 누락이다.**

모델의 자기검증은 믿지 않는다. 아래는 **사람이 숫자만 비교**하는 작업이라 1분이면 끝난다.

### 18.1 숫자 대조 (기능 1개 끝날 때마다)

| 비교 대상 | 레거시 쪽 근거 | 신규 쪽 |
|---|---|---|
| 요청 파라미터 개수 | `endpoint-inventory.csv` 의 `요청파라미터` | `<Xxx>Request` 필드 수 |
| SQL statement 개수 | `mapper-statements.csv` 의 해당 id 목록 | Mapper XML 의 select/insert/update/delete 수 |
| SELECT 컬럼 개수 | 레거시 SQL | `<Xxx>Row` 필드 수 |
| 화면 컬럼 개수 | 레거시 JSP 의 `<th>` 수 | `columnDefs` 길이 |
| 화면 버튼 개수 | 레거시 JSP 의 button 수 | 페이지의 `<Button>` 수 |
| 엔드포인트 개수 | `endpoint-inventory.csv` 의 해당 기능 행 수 | Controller 메서드 수 |

숫자가 다르면 **그 파일만 다시 만들게 한다.** 나머지는 건드리지 않는다.

```powershell
# 대조용 카운트 뽑기
(Select-String -Path '레거시경로\userList.jsp' -Pattern '<th').Count
(Select-String -Path '신규경로\UserListMapper.xml' -Pattern '<(select|insert|update|delete)\s').Count
```

### 18.2 TODO 수거 (가장 중요)

사람이 이어받을 지점이 전부 TODO 로 남아 있어야 한다. **TODO 가 0건이면 오히려 의심하라.**
레거시에 스크립틀릿·프로시저·외부연동이 있었는데 TODO 가 없다면, 모델이 조용히 버렸다는 뜻이다.

```powershell
# 변환 결과에서 TODO 전수 수거 -> 사람 작업 목록
Get-ChildItem -Recurse -Include *.java,*.ts,*.tsx,*.xml |
  Select-String -Pattern 'TODO\((확인필요|로직이관|미이관)\)' |
  Select-Object Path, LineNumber, Line |
  Export-Csv '_analysis\20_todo-backlog.csv' -NoTypeInformation -Encoding UTF8
```

`20_todo-backlog.csv` 가 **사람이 다시 코딩해야 할 작업 목록**이다. 이번 컨버전의 진짜 산출물 중 하나다.

### 18.3 눈으로 보는 것 2가지

```
1. 레거시 JSP 와 신규 Page.tsx 를 나란히 놓고 화면 요소 순서가 같은지 본다.
2. 레거시 SQL 과 신규 Mapper XML 을 나란히 놓고 WHERE 절이 같은지 본다.
   목록 쿼리와 count 쿼리의 WHERE 가 서로 다르면 페이징이 깨진다 (가장 흔한 실수).
```

### 18.4 하지 않는 것

```
X  gradlew build / compileJava
X  npm run build / tsc --noEmit / eslint
X  테스트 코드 작성
X  모델에게 "검토해봐" 라고 시키기
-> 전부 사람이 이어받는 단계에서 한다. 지금 하면 시간만 쓴다.
```

---

## 19. 작업 티켓 포맷 (기능 1개 = 티켓 1개)

분석 산출물에서 스크립트가 생성한다. **모델은 이 티켓 하나만 보고 작업한다.**

```json
{
  "featureId": "PTL-0001",
  "wave": 1,
  "domain": "user",
  "task": "user",
  "Xxx": "UserList",
  "xxx": "userList",
  "restPath": "users",
  "legacy": {
    "jsp": "portal/user/userList.jsp",
    "handler": "com.company.portal.user.UserAction#list (UserAction.java:88)",
    "url": "/portal/user/list.do",
    "params": [{ "name": "searchType", "type": "String", "required": false }],
    "statements": ["user.selectUserList", "user.selectUserListCount"],
    "tables": ["TB_USER", "TB_DEPT"]
  },
  "target": {
    "beRepo": "svc-user",
    "feRepo": "fe-user",
    "route": "/users",
    "files": [
      "src/main/resources/mapper/user/UserListMapper.xml",
      "src/main/java/com/company/user/user/dto/UserListRow.java",
      "src/main/java/com/company/user/user/mapper/UserListMapper.java",
      "src/main/java/com/company/user/user/dto/UserListSearchRequest.java",
      "src/main/java/com/company/user/user/dto/UserListResponse.java",
      "src/main/java/com/company/user/user/service/UserListService.java",
      "src/main/java/com/company/user/user/controller/UserListController.java",
      "src/entities/user/model/types.ts",
      "src/entities/user/api/userListApi.ts",
      "src/entities/user/api/userListQueries.ts",
      "src/pages/user/list/ui/UserListPage.tsx",
      "src/app/routes/user/list.tsx"
    ]
  },
  "todos": []
}
```

### 실행 순서

```
Wave 0 (기반 — 사람이 만든다. 모델에게 시키지 마라)
  1. platform-bom / platform-core (ApiResponse, PageResponse, 예외, MyBatis 설정)
  2. gateway
  3. fe-shell 골격 + agGridSetup + IntlProvider + http 설정
  4. @company/react-common-module 버전 충돌 해결 (3.1)
  5. 레거시 화면 1개를 사람이 끝까지 컨버전 → "레퍼런스 기능" 확정
     ★ 이 레퍼런스 결과물을 이후 모든 프롬프트에 예시로 붙인다. 정확도가 가장 크게 오른다.

Wave 1~3 (모델 투입)
  티켓 1개 → BE-1..7 → FE-1..5 → 18장 숫자 대조 → 다음 티켓
  절대 티켓 여러 개를 동시에 주지 마라.
```

> **한 번에 티켓 1개, 티켓 안에서 파일 1개.**
> 이 규칙 하나만 지켜도 저성능 모델의 성공률이 가장 크게 올라간다.

---

## 20. 이 문서를 LLM 에게 물리는 법

**질문: "CONVERSION_GUIDE.md 읽고 컨버전해줘" 라고 해도 되나?**
→ **도구가 파일을 읽을 수 있으면 된다.** (Claude Code, Cursor 등) 다만 그대로 던지면 정확도가 떨어진다.

### 20.1 왜 통째로 던지면 안 되나

```
이 문서는 1300줄이다. 통째로 컨텍스트에 넣으면:
  - 저성능 모델은 앞부분 규칙을 뒷부분에서 잊는다
  - 한 번에 파일 12개를 만들려 든다 (가장 흔한 실패)
  - 관련 없는 장(FE 템플릿)이 BE 작업에 섞여 들어온다
```

### 20.2 권장 입력 형태 — 장 번호를 지정한다

```text
CONVERSION_GUIDE.md 의 1장, 9.1, 10장 BE-1 만 읽어라.
다른 장은 읽지 마라.

그 규칙에 따라 아래 레거시 SQL 을 Mapper XML 로 변환하라.
파일 1개만 출력하고 설명은 쓰지 마라.

도메인: user   업무: user   Xxx: UserList
레거시 출처: psm-portal/.../UserList_SQL.xml:45
레거시 SQL:
{{원본}}
```

파일 종류별로 읽힐 장:

| 만들 파일 | 읽힐 장 |
|---|---|
| Mapper XML | 1장, 9.1, 10장 BE-1, 11장 |
| Row | 1장, 9.2, 10장 BE-2 |
| Mapper 인터페이스 | 1장, 9.3, 10장 BE-3 |
| Request | 1장, 9.4, 10장 BE-4 |
| Response / Service / Controller | 1장, 6장, 7장, 9.4~9.6, 10장 BE-5~7 |
| FE 타입 | 1장, 13장 FE-1 |
| FE api / queries | 1장, 12.3, 12.4, 13장 FE-2 |
| FE 페이지 | 1장, 5장, 12.5, 13장 FE-4, 15장, 16장 |
| FE 라우트 | 1장, 12.6, 13장 FE-5 |

### 20.3 한 번에 시킬 수 있는 최대 단위

```
성능 높은 모델 : 티켓 1개(파일 12개)를 순서대로. 단 파일마다 응답을 끊는다.
성능 낮은 모델 : 파일 1개. 예외 없음.

어느 쪽이든 "여러 티켓을 한 번에" 는 금지.
```

### 20.4 세션 시작 시 한 번 던질 고정 문장

```text
지금부터 레거시 컨버전 작업을 한다.

규칙:
- CONVERSION_GUIDE.md 의 1장(컨버전 절대 규칙)을 먼저 읽고 매 응답에 적용한다.
- 내가 지정한 장 외에는 읽지 마라.
- 한 응답에 파일 1개만 출력한다. 설명·요약·주의사항은 쓰지 마라.
- 빌드·컴파일·테스트는 하지 않는다. 컴파일 에러는 신경 쓰지 마라.
- 대신 레거시에 있던 것을 하나도 빠뜨리지 마라.
- 옮기지 못한 로직은 // TODO(로직이관): 으로 남긴다. 조용히 버리면 안 된다.
- 모든 파일 맨 위에 레거시 출처 주석을 단다.

준비됐으면 "준비됨" 한 단어만 답하라.
```

### 20.5 티켓 없이 바로 시키고 싶을 때

19장 티켓 JSON 을 매번 만들기 번거로우면, 최소 입력은 이것뿐이다.

```text
[읽을 장] 1장, 9.1, 10장 BE-1
[도메인] user   [업무] user   [Xxx] UserList
[레거시 출처] {{파일경로:라인}}
[레거시 원본]
{{붙여넣기}}
```

나머지 이름(패키지·클래스명·REST 경로)은 6장 네이밍 규칙으로 기계적으로 나온다.
모델이 이름을 지어내면 6장을 같이 읽히면 된다.
