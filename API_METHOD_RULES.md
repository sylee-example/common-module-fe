# API HTTP Method 규칙

API 설계 시 HTTP method 와 URL 을 정하는 팀 규칙을 정리한다.
REST 정석보다 **내부 보안 정책과 일관성**을 우선한다.

관련 구현: `src/lib/http.ts` (`createHttp`, `getHttp`)

---

## 요약

| 작업 | Method | URL 예시 |
|---|---|---|
| 목록 / 검색 | `POST` | `POST /items/search` |
| 단건 조회 | `GET` (보안상 ID 노출 불가 시 `POST`) | `GET /items/{id}` |
| 등록 | `POST` | `POST /items` |
| upsert (등록 + 수정 혼합) | `POST` | `POST /items/bulk` |
| 복잡한 비즈니스 처리 | `POST` | `POST /orders/{id}/cancel` |
| 수정 (단건 / 다건, 전체 / 일부) | `PATCH` | `PATCH /items/{id}`, `PATCH /items` |
| 삭제 (단건) | `DELETE` | `DELETE /items/{id}` |
| 삭제 (다건) | `POST` | `POST /items/bulk-delete` |
| `PUT` | **사용 안 함** | - |

### 결정 흐름

```
조회인가? ───────────── 예 → 목록/검색: POST /{리소스}/search
  │                          단건: GET /{리소스}/{id}
  아니오
  ↓
삭제인가? ───────────── 예 → 단건: DELETE / 다건: POST /{리소스}/bulk-delete
  │
  아니오
  ↓
기존 데이터 수정만인가? ── 예 → PATCH (건수, 변경 필드 수 무관)
  │
  아니오 (insert 포함, upsert, 비즈니스 로직)
  ↓
POST
```

---

## 1. 조회 — `POST` (검색) / `GET` (단건)

- 검색 조건은 **URL 에 노출하지 않는다** (서버 로그, 브라우저 히스토리, Referer 노출 방지)
- 검색 조건은 body 로 보낸다
- 등록(`POST /items`)과 구분하기 위해 반드시 `/search` 를 붙인다
- 응답은 `200 OK`

```ts
http.post('/items/search', { keyword: 'A', page: 1, size: 20 });
http.get(`/items/${id}`);
```

> POST 조회는 브라우저 / CDN 캐시가 적용되지 않는다. 내부 시스템이라 허용한다.

## 2. 등록 / upsert / 비즈니스 처리 — `POST`

- 신규 등록: `POST /items` → `201 Created`
- upsert (등록 + 수정 혼합, 다건): `POST /items/bulk` → `200 OK` + 처리 결과
- 비즈니스 처리: `POST /{리소스}/{id}/{동사}` 형식 → `200 OK`
  - 예: `POST /orders/{id}/cancel`, `POST /orders/{id}/approve`

```json
// POST /items/bulk 응답
{ "inserted": 12, "updated": 88 }
```

## 3. 수정 — `PATCH`

수정은 **단건 / 다건, 전체 필드 / 일부 필드 구분 없이 모두 `PATCH`** 를 쓴다.
`PUT` 은 사용하지 않는다.

| 경우 | URL |
|---|---|
| 단건 수정 | `PATCH /items/{id}` |
| 다건 수정 | `PATCH /items` |

```json
// PATCH /items
{
  "items": [
    { "code": "A001", "name": "상품1", "qty": 10 },
    { "code": "A002", "name": "상품2", "qty": 5 }
  ]
}
```

- 수정 대상 식별 key 는 **body 에 포함**한다 (다건일 때)
- key 컬럼, `createdAt` 등은 **수정 불가** — 수정 가능 필드를 화이트리스트로 관리한다
- 없는 key 가 포함되면 전체 실패 처리한다 (`404` + 없는 key 목록)
- 응답은 `200 OK` (변경 결과 필요 시) 또는 `204 No Content`

### 일부 필드만 보내는 경우: 누락 vs `null`

| 요청 | 의미 |
|---|---|
| 필드 누락 | 기존 값 유지 |
| `"name": null` | `null` 로 변경 |

- Java DTO 는 둘 다 `null` 이라 구분 불가 → `JsonNullable` (`jackson-databind-nullable`) 사용
- key 제외 **전체 필드를 항상 보내는 API** 는 일반 DTO + `@Valid` 로 충분하다

## 4. 삭제 — `DELETE` (soft delete)

`DELETE` method 를 쓰고, 실제 데이터는 삭제하지 않고 **삭제 플래그만 update** 한다.

### 조건: 삭제 후 클라이언트에게 "없는 데이터"로 보여야 한다

- `GET /items/{id}` → `404`
- 목록 / 검색 결과에서 제외

삭제 후에도 조회되는 경우(비활성, 보관, 휴면)는 삭제가 아니라 **상태 변경**이므로 `PATCH` 로 `status` 를 바꾼다.

| 사용자 관점 | Method |
|---|---|
| 삭제 (이후 안 보임) | `DELETE` |
| 비활성 / 보관 / 휴면 (계속 조회됨) | `PATCH` |

### 규칙

- 단건: `DELETE /items/{id}` → `204 No Content`
- 다건: `POST /items/bulk-delete` → `204 No Content` (이유는 아래 참고)
- 이미 삭제된 데이터에 다시 `DELETE` → `204` (멱등)
- 최초 삭제 시각을 덮어쓰지 않도록 `WHERE id = ? AND deleted = false` 조건을 건다
- `deleted_at`, `deleted_by` 컬럼으로 이력을 남긴다
- 하위 데이터 삭제 여부는 기능별로 명시한다

### 다건 삭제를 `POST` 로 하는 이유

다건 삭제는 삭제할 key 목록을 보내야 한다. `DELETE` 로 보내는 방법은 두 가지인데 둘 다 문제가 있다.

| 방식 | 문제 |
|---|---|
| `DELETE /items` + body 에 key 목록 | 표준상 body 의미 없음, 인프라 / 클라이언트가 body 를 버리거나 거부 |
| `DELETE /items?ids=1,2,3...` | URL 길이 제한, key 가 URL 에 노출 |
| `POST /items/bulk-delete` + body | 문제 없음 |

**1. `DELETE` + body**

- **표준**: RFC 9110 은 `DELETE` body 에 정해진 의미가 없고, 일부 구현체가 요청을 거부할 수 있다고 명시한다
- **인프라**: 사내 프록시, 게이트웨이, WAF 중 일부는 `DELETE` 의 body 를 버리거나 요청을 차단한다.
  그러면 **개발 환경에서는 되다가 운영 환경에서만 실패**할 수 있다
- **클라이언트**: 도구마다 지원이 다르다
  - Spring `RestTemplate.delete()` 는 body 파라미터가 없다
  - axios 는 두 번째 인자가 body 가 아니라 config 라 실수하기 쉽다

```ts
http.delete('/items', { ids });           // ❌ config 로 해석되어 body 전송 안 됨
http.delete('/items', { data: { ids } }); // body 전송됨
```

**2. `DELETE` + query**

- 몇백 건이면 URL 길이 제한에 걸린다 (Tomcat 기본 헤더 크기 8KB)
- key 가 서버 로그, 브라우저 히스토리, Referer 에 남는다 → "검색 조건을 URL 에 노출하지 않는다" 는 보안 규칙과 충돌

**3. `POST` 가 맞는 이유**

- body 가 표준에서 정식 지원되어 인프라 / 클라이언트 문제가 없다
- "복잡한 처리는 `POST /{리소스}/{동사}`" 라는 기존 규칙과 형식이 같다
- 흔히 쓰이는 방식이다 (Google API 설계 가이드도 다건 삭제를 `POST ...:batchDelete` 로 정의)

> `DELETE /items` + body 가 틀린 방식은 아니다. Spring 은 `@DeleteMapping` + `@RequestBody` 로 동작한다.
> 다만 사내 인프라 전 구간에서 통과하는지 확인해야 하고, 문제가 생기면 운영 환경에서 드러나므로 `POST` 로 통일한다.

### 모든 조회에서 삭제 데이터 제외

가장 자주 누락되는 부분이다.

```java
// JPA (Hibernate 6.3+)
@Entity
@SQLDelete(sql = "UPDATE items SET deleted = true, deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted = false")
public class Item { ... }
```

> native query, MyBatis, JdbcTemplate 에는 자동 적용되지 않는다 → `WHERE deleted = false` 직접 작성

### unique key 충돌

삭제된 행에도 unique 값(`code` 등)이 남아 있어 같은 값으로 재등록하면 실패한다.
재등록을 허용하는 테이블은 아래처럼 처리한다.

- `delete_key` 컬럼 추가: 정상 데이터 `0`, 삭제 시 해당 행의 `id`
- unique 제약을 `(code, delete_key)` 로 건다

> `(code, deleted_at)` 으로 걸면 안 된다. MySQL unique 는 `NULL` 중복을 허용하므로
> 삭제되지 않은 데이터끼리의 중복을 막지 못한다.

---

## 5. 다건 처리 공통

- **최대 건수 제한**: 1,000건 초과 시 `400 Bad Request`
- **트랜잭션**: 한 요청 = 한 트랜잭션, 한 건이라도 실패하면 전체 rollback
- **key 존재 확인**: `SELECT code FROM items WHERE code IN (...)` 한 번으로 확인한다
  - update 결과 행 수로 판단하지 않는다 (값이 같으면 `0` 이 나올 수 있음)
- **성능**: JPA `saveAll` / dirty checking 대신 `JdbcTemplate.batchUpdate` 사용
  - JDBC URL 에 `rewriteBatchedStatements=true` 추가
  - upsert 는 MySQL `INSERT ... ON DUPLICATE KEY UPDATE` 사용
  - 부분 수정 다건은 변경 컬럼 조합이 같은 행끼리 묶어서 batch 처리
- **재시도**: 값 지정(`qty = 10`)은 재시도해도 안전하다.
  누적(`qty = qty + 10`)은 중복 반영되므로 `Idempotency-Key` 헤더로 중복을 막는다

## 6. 응답 코드

| 상황 | 코드 |
|---|---|
| 조회 성공 | `200 OK` |
| 등록 성공 | `201 Created` |
| upsert / 비즈니스 처리 / 수정 성공 (결과 반환) | `200 OK` |
| 수정 / 삭제 성공 (결과 없음) | `204 No Content` |
| 검증 실패, 최대 건수 초과 | `400 Bad Request` |
| 대상 없음 | `404 Not Found` |
| unique 충돌 | `409 Conflict` |

---

## 인프라 체크리스트

- [ ] 사내 방화벽 / WAF / 프록시에서 `PATCH`, `DELETE` 가 차단되지 않는지 실제 호출로 확인
- [ ] Spring CORS 설정에 `PATCH`, `DELETE` 추가
  (`CorsRegistry` 기본값은 `GET`, `HEAD`, `POST` 만 허용)

```java
@Override
public void addCorsMappings(CorsRegistry registry) {
  registry.addMapping("/api/**")
      .allowedMethods("GET", "POST", "PATCH", "DELETE");
}
```
