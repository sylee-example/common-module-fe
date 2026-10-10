#!/usr/bin/env python3
"""파일 경로 CSV를 Serena 메모리(.serena/memories/)로 변환합니다.

- 모듈(폴더)별로 메모리 파일을 나눠 만들고, 전체 목차인 file_index 메모리를 함께 생성합니다.
- 에이전트는 메모리 이름 목록만 먼저 받고, 필요한 모듈 메모리만 골라 읽게 됩니다.
- path 외의 열(역할, 키워드 등)이 있으면 각 파일 줄 뒤에 함께 붙습니다.

사용 예:
  python csv_to_serena_memories.py file-index.csv --project /path/to/project
  python csv_to_serena_memories.py file-index.csv --path-column 경로 --depth 2

  
  사용 방법

1. 온보딩을 먼저 실행

Serena는 메모리가 하나도 없을 때만 온보딩(프로젝트 파악 후 메모리 자동 생성)을 하고, 메모리가 있으면 건너뜁니다. 그래서 CSV 메모리를 먼저 넣으면 온보딩이 생략돼요. 순서는 이렇게 하세요.

bash
serena project create          # 프로젝트 폴더에서
serena project index           # 큰 프로젝트면 미리 인덱싱
claude                         # Claude Code에서 첫 세션 → 온보딩 진행

온보딩은 컨텍스트를 많이 쓰니, 끝나면 새 세션으로 시작하는 게 좋아요.

2. 첨부한 스크립트로 CSV 변환

bash
python csv_to_serena_memories.py 파일목록.csv --project /프로젝트/경로
# 경로 열 이름이 path가 아니면
python csv_to_serena_memories.py 파일목록.csv --path-column 경로 --depth 2

생성 결과는 이렇게 됩니다(샘플로 테스트 완료).

.serena/memories/
├── file_index.md          ← 목차 (모듈별 메모리 참조)
└── modules/
    ├── payment.md         ← 결제 모듈 파일 목록
    ├── settle.md
    └── _root.md

CSV에 역할이나 키워드 같은 열이 있으면 각 파일 줄 뒤에 붙어서 들어가요. 공통 경로(src/main/java/com/acme 등)는 한 번만 적고 나머지는 상대 경로로 줄여서 토큰도 아낍니다. --depth는 몇 단계 폴더까지로 묶을지를 정하는데, 메모리 이름 목록도 매 세션 컨텍스트에 들어가니 모듈 메모리가 수십 개 이내가 되도록 조절하세요.

3. 온보딩이 만든 핵심 메모리에서 목차 연결

온보딩이 만든 메모리 중 프로젝트 개요 역할을 하는 파일에 한 줄 추가해 두면, 에이전트가 파일 위치를 찾을 때 목차부터 보게 됩니다.

markdown
- 파일 위치 목차: `mem:file_index` (기능별 파일을 찾을 때 먼저 참고)

mem: 접두어를 붙여 백틱으로 감싸야 Serena가 참조로 인식하고, 나중에 이름이 바뀌어도 자동으로 따라갑니다.

다른 방법: CSV를 그대로 두기

메모리로 바꾸지 않고 CSV를 프로젝트에 둔 채 CLAUDE.md에 "파일 위치는 docs/file-index.csv를 검색해서 찾을 것, 통째로 읽지 말 것"이라고 적는 방법도 있어요. 참고로 Claude Code에서는 Serena의 기본 파일 읽기, 검색 도구가 기본적으로 꺼져 있고 Claude Code 자체 도구가 그 역할을 하기 때문에, 이 경우 CSV는 Serena가 아니라 Claude Code가 읽게 됩니다. .gitignore에 걸린 폴더에 두면 검색에서 빠질 수 있으니 주의하세요.

운영 팁
.serena/memories/는 git에 커밋해서 팀과 공유할 수 있어요.
파일 구조가 바뀌면 스크립트를 다시 돌리면 됩니다. modules/ 아래 파일은 덮어쓰지만 온보딩이 만든 메모리는 건드리지 않아요. 다만 폴더가 없어진 모듈의 옛 메모리 파일은 남으니 직접 지워주세요.
메모리 참조가 깨졌는지는 serena memories check로 확인할 수 있어요.
"""
import argparse
import csv
import posixpath
import sys
from collections import defaultdict
from pathlib import Path


def read_rows(csv_path):
    # 한국어 윈도우 엑셀에서 저장한 CSV(cp949)도 읽을 수 있게 두 인코딩을 시도
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(csv_path, newline="", encoding=enc) as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    sys.exit("CSV 인코딩을 읽을 수 없습니다 (utf-8, cp949 시도함).")


def common_prefix(paths):
    dirs = [posixpath.dirname(p) for p in paths]
    try:
        prefix = posixpath.commonpath(dirs) if dirs else ""
    except ValueError:  # 절대/상대 경로가 섞인 경우
        prefix = ""
    return "" if prefix in (".", "/") else prefix


def main():
    ap = argparse.ArgumentParser(description="파일 경로 CSV → Serena 메모리 변환")
    ap.add_argument("csv", help="파일 경로가 담긴 CSV")
    ap.add_argument("--project", default=".", help="프로젝트 루트 (기본: 현재 폴더)")
    ap.add_argument("--path-column", default="path", help="경로가 들어 있는 열 이름 (기본: path)")
    ap.add_argument("--depth", type=int, default=1,
                    help="공통 경로 아래 몇 단계 폴더까지로 묶을지 (기본: 1)")
    args = ap.parse_args()

    rows = read_rows(args.csv)
    if not rows:
        sys.exit("CSV에 데이터가 없습니다.")
    if args.path_column not in rows[0]:
        sys.exit(f"'{args.path_column}' 열이 없습니다. 현재 열: {', '.join(rows[0].keys())}\n"
                 f"--path-column 으로 경로 열 이름을 지정하세요.")

    for r in rows:
        r[args.path_column] = (r[args.path_column] or "").strip().replace("\\", "/")
    rows = [r for r in rows if r[args.path_column]]
    prefix = common_prefix([r[args.path_column] for r in rows])

    groups = defaultdict(list)
    for r in rows:
        path = r[args.path_column]
        rel = posixpath.relpath(path, prefix) if prefix else path
        dir_parts = rel.split("/")[:-1]
        group = "/".join(dir_parts[: args.depth]) or "_root"
        extras = [f"{k}: {v.strip()}" for k, v in r.items()
                  if k != args.path_column and v and v.strip()]
        line = f"- `{rel}`" + (f" — {'; '.join(extras)}" if extras else "")
        groups[group].append(line)

    mem_dir = Path(args.project) / ".serena" / "memories"
    mod_dir = mem_dir / "modules"
    mod_dir.mkdir(parents=True, exist_ok=True)

    index_lines = [
        "# 파일 인덱스 (CSV에서 자동 생성)",
        "",
        f"기준 경로: `{prefix or '(프로젝트 루트)'}` — 아래 모듈 메모리의 경로는 모두 이 기준 경로 아래의 상대 경로임.",
        "",
        "관련 모듈의 메모리만 골라 읽을 것. 전부 읽지 말 것.",
        "",
    ]
    for group in sorted(groups):
        name = "modules/" + group.replace("/", ".")
        lines = groups[group]
        (mem_dir / f"{name}.md").write_text(
            "\n".join([f"# {group} 파일 목록", "",
                       f"기준 경로: `{prefix or '(프로젝트 루트)'}`", "", *sorted(lines), ""]),
            encoding="utf-8",
        )
        index_lines.append(f"- `mem:{name}` — {len(lines)}개 파일")

    (mem_dir / "file_index.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")

    print(f"완료: {len(rows)}개 파일 → 모듈 메모리 {len(groups)}개 + file_index")
    print(f"위치: {mem_dir.resolve()}")
    if len(groups) > 50:
        print("참고: 모듈 메모리가 50개를 넘습니다. 메모리 이름 목록도 매번 컨텍스트에 들어가니 "
              "--depth 값을 줄여 묶음을 크게 하는 것을 권장합니다.")


if __name__ == "__main__":
    main()
