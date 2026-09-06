# Nexus 배포 없이 로컬에서 바로 쓰는 방법

`@company/react-common-module` 을 사내 Nexus에 `npm publish` 하지 않고,
로컬 파일 시스템에서 곧바로 소비 프로젝트에 연결하는 방법들을 정리한다.

개발 중 수정 → 확인 사이클을 돌릴 때, 또는 아직 버전을 올리기 애매한 실험 단계에서 쓴다.

---

## 0. 전제: 먼저 빌드해야 한다

`package.json` 의 `files` 는 `["dist"]`, `main`/`module`/`types` 도 전부 `dist` 를 가리킨다.
따라서 아래 방법 대부분은 **`dist` 가 존재해야** 동작한다.

```bash
cd ~/workplace/react-common-module
npm run build          # dist/index.js, dist/index.cjs, dist/index.d.ts 생성
```

개발 중이라면 watch 모드로 띄워두면 저장할 때마다 `dist` 가 갱신된다.

```bash
npx vite build --watch
```

> `vite build --watch` 는 `tsc --noEmit` 을 돌지 않으므로, 타입 검증은 별도 터미널에서
> `npx tsc --noEmit --watch` 로 같이 돌리는 편이 낫다.

`vite-plugin-dts` 가 watch 모드에서 `.d.ts` 재생성을 건너뛰는 경우가 있다.
타입이 안 갱신되면 `npm run build` 를 한 번 다시 돌린다.

---

## 방법 비교

| 방법 | 설치 명령 | 실시간 반영 | 실제 배포와 동일성 | 추천도 |
|---|---|---|---|---|
| 1. `npm pack` + tarball | `npm i ../rcm/company-...tgz` | ✕ (재빌드+재설치) | ★★★ 가장 높음 | 검증용 최적 |
| 2. `npm link` | `npm link @company/...` | ○ | ★ (심볼릭 링크) | 빠르지만 함정 많음 |
| 3. `file:` 프로토콜 | `npm i file:../rcm` | △ (npm 버전별 상이) | ★★ | 간단함 |
| 4. `yalc` | `yalc add @company/...` | ○ (`yalc push`) | ★★★ | **일상 개발 최적** |
| 5. workspaces (모노레포) | 자동 | ○ | ★★ | 같은 레포일 때 |
| 6. Git URL 설치 | `npm i git+ssh://...` | ✕ | ★★★ | 팀 공유용 |
| 7. 번들러 alias (소스 직접) | 설정만 | ○ (HMR) | ✕ (빌드 안 거침) | 디버깅용 |
| 8. Verdaccio 로컬 레지스트리 | `npm i --registry=...` | ✕ | ★★★ | 배포 리허설 |

---

## 1. `npm pack` + tarball 설치 (가장 안전)

실제 `npm publish` 가 올리는 것과 **완전히 동일한 산출물**을 만들어 설치한다.
`files` 필드 누락, `exports` 경로 오류 같은 배포 사고를 사전에 잡아낸다.

```bash
# 모듈 쪽
cd ~/workplace/react-common-module
npm run build
npm pack                  # company-react-common-module-0.1.0.tgz 생성
```

```bash
# 소비 프로젝트 쪽
cd ~/workplace/my-app
npm i ../react-common-module/company-react-common-module-0.1.0.tgz
```

`package.json` 에는 이렇게 기록된다.

```json
"dependencies": {
  "@company/react-common-module": "file:../react-common-module/company-react-common-module-0.1.0.tgz"
}
```

**장점**: peerDependencies 해석, 심볼릭 링크 중복 인스턴스 문제가 전혀 없다. 진짜 배포본과 같다.
**단점**: 코드를 고칠 때마다 `npm pack` → `npm i` 를 반복해야 한다.

tarball 안에 무엇이 들어가는지 먼저 확인하고 싶으면:

```bash
npm pack --dry-run
```

`.gitignore` 에 `*.tgz` 를 추가해 두는 것을 권장한다.

---

## 2. `npm link`

전역 `node_modules` 에 심볼릭 링크를 만들어 연결한다.

```bash
# 모듈 쪽
cd ~/workplace/react-common-module
npm run build
npm link                          # 전역에 @company/react-common-module 등록
```

```bash
# 소비 프로젝트 쪽
cd ~/workplace/my-app
npm link @company/react-common-module
```

해제:

```bash
cd ~/workplace/my-app
npm unlink --no-save @company/react-common-module
npm i                             # package.json 기준으로 원복

cd ~/workplace/react-common-module
npm unlink -g @company/react-common-module
```

### ⚠️ link 사용 시 반드시 걸리는 문제: React 중복 인스턴스

이 모듈은 `react`, `antd`, `@tanstack/react-query`, `zustand` 등을 **peerDependencies** 로 두고
`vite.config.ts` 에서 번들 external 처리한다. 그런데 개발용으로 `devDependencies` 에도
같은 패키지들이 설치되어 있다.

심볼릭 링크 상태에서는 Node/Vite가 `react` 를 찾을 때
`react-common-module/node_modules/react` 를 먼저 잡아버려서 **React가 두 개 로딩**된다.

```
Invalid hook call. Hooks can only be called inside of the body of a function component.
```
```
Warning: Invalid hook call ... You might have more than one copy of React in the same app
```

**해결책 A — 소비 프로젝트 Vite에 dedupe/alias 추가 (권장)**

```ts
// my-app/vite.config.ts
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    // 어떤 경로로 import 되든 소비 프로젝트의 사본 하나만 쓰게 강제
    dedupe: [
      'react',
      'react-dom',
      'antd',
      '@tanstack/react-query',
      'zustand',
      'react-hook-form',
      'ag-grid-community',
      'ag-grid-react',
    ],
    alias: {
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  optimizeDeps: {
    // 링크된 패키지는 pre-bundle 대상에서 제외해야 수정이 즉시 반영된다
    exclude: ['@company/react-common-module'],
  },
});
```

**해결책 B — 모듈 쪽 peer 패키지를 반대로 링크**

```bash
cd ~/workplace/react-common-module
npm link ../my-app/node_modules/react ../my-app/node_modules/react-dom
```

**해결책 C — 아예 방법 1(tarball)이나 방법 4(yalc)를 쓴다.**
실무에서는 이쪽이 훨씬 스트레스가 적다.

### Vite 추가 설정

링크된 경로는 프로젝트 루트 밖이라 Vite dev server가 파일 접근을 막을 수 있다.

```ts
server: {
  fs: { allow: ['..'] },   // 상위 디렉토리 접근 허용
  watch: { ignored: ['!**/node_modules/@company/react-common-module/**'] },
}
```

---

## 3. `file:` 프로토콜로 직접 설치

```bash
cd ~/workplace/my-app
npm i file:../react-common-module
```

```json
"dependencies": {
  "@company/react-common-module": "file:../react-common-module"
}
```

npm 7 이상에서 `file:` 은 디렉토리를 가리킬 때 **심볼릭 링크로 처리**한다.
즉 `npm link` 와 동일한 React 중복 문제를 그대로 겪는다. 위 dedupe 설정을 같이 적용할 것.

디렉토리 대신 **tarball** 을 가리키면(방법 1) 실제 복사가 일어나 안전하다.

pnpm 을 쓴다면 `link:` 와 `file:` 이 구분된다.

```bash
pnpm add link:../react-common-module   # 심볼릭 링크
pnpm add file:../react-common-module   # 복사(hard link)
```

---

## 4. `yalc` (일상 개발에 가장 추천)

`npm link` 의 실시간성과 `npm pack` 의 안전성을 합친 도구.
전역 저장소에 패키지를 "가짜 publish" 하고, 소비 프로젝트에는 **실제 파일을 복사**해 넣는다.
심볼릭 링크가 아니므로 React 중복 문제가 없다.

```bash
npm i -g yalc
```

```bash
# 모듈 쪽 — 로컬 저장소에 배포
cd ~/workplace/react-common-module
npm run build
yalc publish
```

```bash
# 소비 프로젝트 쪽 — 설치
cd ~/workplace/my-app
yalc add @company/react-common-module
npm i
```

수정 후 반영:

```bash
cd ~/workplace/react-common-module
npm run build && yalc push     # 이 패키지를 쓰는 모든 프로젝트에 즉시 전파
```

`package.json` 에 편의 스크립트를 넣어두면 편하다.

```json
"scripts": {
  "dev:local": "vite build --watch",
  "push:local": "npm run build && yalc push"
}
```

제거:

```bash
cd ~/workplace/my-app
yalc remove @company/react-common-module
npm i
```

`.yalc/` 디렉토리와 `yalc.lock` 은 `.gitignore` 에 추가한다.

```gitignore
.yalc/
yalc.lock
*.tgz
```

> ⚠️ `yalc add` 는 소비 프로젝트 `package.json` 의 의존성을
> `"file:.yalc/@company/react-common-module"` 로 바꾼다. **커밋하지 않도록 주의.**

---

## 5. npm workspaces (같은 레포 안에 둘 때)

모듈과 소비 앱을 하나의 레포로 합칠 수 있다면 이게 가장 깔끔하다.
peerDependencies 가 루트 `node_modules` 로 호이스팅되어 중복 인스턴스 문제가 자연히 사라진다.

```
my-monorepo/
├─ package.json
├─ packages/
│  └─ react-common-module/
└─ apps/
   └─ my-app/
```

```json
// 루트 package.json
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": ["packages/*", "apps/*"]
}
```

```json
// apps/my-app/package.json
"dependencies": {
  "@company/react-common-module": "*"
}
```

```bash
npm i                                   # 루트에서 한 번
npm run build -w @company/react-common-module
npm run dev  -w my-app
```

pnpm 이라면 `pnpm-workspace.yaml` + `"@company/react-common-module": "workspace:*"`.

---

## 6. Git URL 로 설치 (팀원과 공유해야 할 때)

Nexus 없이 사내 GitLab/GitHub 저장소만으로 배포 대용이 된다.

```bash
npm i git+ssh://git@gitlab.your-company.com:frontend/react-common-module.git#main
# 태그 고정
npm i git+ssh://git@gitlab.your-company.com:frontend/react-common-module.git#v0.1.0
```

**주의**: `dist` 는 `.gitignore` 대상이라 저장소에 없다. 두 가지 중 하나를 택한다.

**A. `prepare` 스크립트로 설치 시 자동 빌드** (권장)

```json
"scripts": {
  "prepare": "npm run build"
}
```

`prepare` 는 git 의존성으로 설치될 때 npm이 자동 실행한다.
단, 소비 프로젝트 설치 시 이 모듈의 `devDependencies`(vite, typescript 등)가 함께 설치되어 느려진다.

**B. `dist` 를 커밋해서 릴리스 브랜치로 관리**

```bash
git checkout -b release
sed -i '' '/^dist$/d' .gitignore
npm run build && git add -f dist && git commit -m "빌드 산출물 추가"
git push origin release
```

---

## 7. 번들러 alias 로 소스 직접 참조 (빌드 생략)

`dist` 를 만들지 않고 `src` 를 그대로 가져다 쓴다. HMR이 그대로 동작해서 디버깅에 좋다.
다만 **빌드 파이프라인을 우회**하므로 배포본과 동작이 다를 수 있다. 최종 검증은 방법 1로 할 것.

```ts
// my-app/vite.config.ts
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@company/react-common-module': resolve(__dirname, '../react-common-module/src/index.ts'),
    },
    dedupe: ['react', 'react-dom', 'antd'],
  },
  server: {
    fs: { allow: ['..'] },
  },
});
```

TypeScript 도 같은 경로를 알아야 한다.

```json
// my-app/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@company/react-common-module": ["../react-common-module/src/index.ts"]
    }
  },
  "include": ["src", "../react-common-module/src"]
}
```

**제약**
- 소비 프로젝트가 이 모듈의 `.tsx` 를 직접 컴파일하므로, `jsx: react-jsx` / `moduleResolution: bundler` 등 컴파일러 옵션 호환이 필요하다.
- Next.js 라면 `transpilePackages: ['@company/react-common-module']` 를 `next.config.js` 에 추가.
- `exports` 맵을 우회하므로 서브패스 import 검증이 안 된다.

---

## 8. Verdaccio 로컬 레지스트리 (배포 리허설)

Nexus를 건드리지 않고 `npm publish` → `npm install` 전 과정을 그대로 예행연습한다.
버전 범위(`^0.1.0`) 해석, `publishConfig`, 인증 흐름까지 실제와 같이 검증된다.

```bash
npx verdaccio          # http://localhost:4873 에서 실행
```

```bash
# 모듈 쪽 — 최초 1회 계정 생성
npm adduser --registry http://localhost:4873

# 배포 (publishConfig.registry 를 덮어써야 한다)
cd ~/workplace/react-common-module
npm run build
npm publish --registry http://localhost:4873
```

```bash
# 소비 프로젝트 쪽
cd ~/workplace/my-app
npm i @company/react-common-module --registry http://localhost:4873
```

매번 플래그를 넘기기 싫으면 소비 프로젝트 `.npmrc` 에:

```
@company:registry=http://localhost:4873
```

같은 버전으로 재배포하려면 먼저 unpublish 한다.

```bash
npm unpublish @company/react-common-module@0.1.0 --registry http://localhost:4873 --force
```

---

## 상황별 권장

| 상황 | 권장 방법 |
|---|---|
| 모듈 고치면서 앱에서 바로 확인 | **4. yalc** (+ `vite build --watch`) |
| 모듈 내부를 브레이크포인트로 디버깅 | **7. 번들러 alias** |
| 배포 전 최종 검증 | **1. npm pack** 또는 **8. Verdaccio** |
| 앱과 모듈을 한 레포로 관리 가능 | **5. workspaces** |
| Nexus 없이 팀원에게 배포 | **6. Git URL** |
| 급할 때, 1회성 | **3. `file:`** (dedupe 설정 필수) |

---

## 공통 체크리스트

문제가 생기면 아래를 순서대로 확인한다.

```bash
# 1) dist 가 최신인가
ls -la ~/workplace/react-common-module/dist

# 2) 소비 프로젝트가 실제로 무엇을 보고 있는가
cd ~/workplace/my-app
ls -la node_modules/@company/          # 심볼릭 링크(->)인지 실제 디렉토리인지
node -p "require.resolve('@company/react-common-module')"

# 3) React 가 몇 개인가  (2개 이상이면 중복 인스턴스 문제)
find . ../react-common-module -path '*/node_modules/react/package.json' -not -path '*/node_modules/*/node_modules/*'

# 4) Vite 캐시 비우기 — 반영이 안 될 때 대부분 여기가 원인
rm -rf node_modules/.vite && npm run dev
```

### peerDependencies 는 소비 프로젝트가 직접 설치한다

로컬 연결 방식은 peerDependencies 를 자동 설치해주지 않는다. 누락되면 런타임에 터진다.

```bash
npm i react react-dom antd ag-grid-community ag-grid-react @ag-grid-community/locale \
      @tanstack/react-query axios zustand react-hook-form @hookform/resolvers zod
```

### 로컬 연결 흔적을 커밋하지 말 것

`file:`, `link:`, `.yalc` 경로가 `package.json` / lock 파일에 남으면 CI가 깨진다.
작업이 끝나면 원복한다.

```bash
git diff package.json package-lock.json    # 커밋 전 확인
```

`.gitignore` 권장 항목:

```gitignore
*.tgz
.yalc/
yalc.lock
```
