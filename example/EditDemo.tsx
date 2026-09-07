import { useMemo, useRef, useState } from 'react';
import { Button, Space, Switch, Tag, Typography, message } from 'antd';
import type { GridApi } from 'ag-grid-community';
import { CommonGrid } from '../src/components/grid/CommonGrid';
import { exportGridToExcel, type ExcelColDef } from '../src/lib/excelExport';
import { internStrings } from '../src/lib/internStrings';
import { SelectCellEditor } from '../src/components/grid/editors/SelectCellEditor';
import { SearchCellEditor } from '../src/components/grid/editors/SearchCellEditor';
import type { CommonSelectOption } from '../src/components/select/CommonSelect';

interface Row {
  name: string;
  role: string;
  team: string;
  vendorCode: string;
  memo: string;
  phone: string;
  city: string;
  grade: string;
  /** 숫자 서식(콤마·우측정렬)과 엑셀 합계 검증용 */
  qty: number;
  /** 소수 서식 검증용 */
  price: number;
  /** 날짜 타입 검증용 */
  regDate: string;
  /** 앞자리 0 이 보존되는지 검증용 (숫자로 변환되면 안 된다) */
  zipCode: string;
  /** 수식 인젝션 방어 검증용 */
  risky: string;
}

const ROLES: CommonSelectOption<string>[] = [
  { label: '관리자', value: 'ADMIN' },
  { label: '일반', value: 'USER' },
  { label: '조회전용', value: 'VIEWER' },
];

const TEAMS: CommonSelectOption<string>[] = [
  { label: '재고관리팀', value: 'STOCK' },
  { label: '영업1팀', value: 'SALES1' },
  { label: '영업2팀', value: 'SALES2' },
  { label: '전산팀', value: 'IT' },
];

const VENDORS = [
  { code: 'V001', name: '가나상사' },
  { code: 'V002', name: '나다물산' },
  { code: 'V003', name: '다라테크' },
  { code: 'V004', name: '라마유통' },
  { code: 'V005', name: '마바산업' },
];
const VENDOR_NAME: Record<string, string> = Object.fromEntries(
  VENDORS.map((v) => [v.code, v.name]),
);

/** 서버 조회를 흉내낸다. 지연을 줘야 debounce/stale 처리를 눈으로 볼 수 있다 */
function searchVendors(keyword: string): Promise<CommonSelectOption<string>[]> {
  console.log('[SearchCellEditor] 조회 요청:', keyword);
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve(
          VENDORS.filter((v) => v.name.includes(keyword) || v.code.includes(keyword)).map((v) => ({
            label: v.name,
            value: v.code,
          })),
        ),
      400,
    );
  });
}

const makeRows = (): Row[] =>
  internStrings(
    Array.from({ length: 12 }, (_, i) => ({
      name: `사용자${i + 1}`,
      role: ROLES[i % ROLES.length].value,
      team: TEAMS[i % TEAMS.length].value,
      vendorCode: VENDORS[i % VENDORS.length].code,
      memo: `메모 ${i + 1}`,
      phone: `010-0000-${String(1000 + i)}`,
      city: ['서울', '부산', '대구'][i % 3],
      grade: ['A', 'B', 'C'][i % 3],
      qty: (i + 1) * 1234,
      price: (i + 1) * 1234.56,
      regDate: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      zipCode: String(1000 + i).padStart(6, '0'),
      risky: i === 0 ? '=1+1' : i === 1 ? '@SUM(A1:A9)' : `정상값 ${i}`,
    })),
  );

export function EditDemo() {
  const [rows] = useState(makeRows);
  const [manyColumns, setManyColumns] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>('아직 없음');
  const apiRef = useRef<GridApi<Row> | null>(null);

  const download = (options: Parameters<typeof exportGridToExcel>[1]) => {
    if (!apiRef.current) return;
    exportGridToExcel(apiRef.current, options);
    message.success('엑셀 생성 완료');
  };

  const columnDefs = useMemo<ExcelColDef<Row>[]>(() => {
    const base: ExcelColDef<Row>[] = [
      { field: 'name', headerName: '이름', editable: true },
      {
        field: 'role',
        headerName: '권한',
        editable: true,
        cellEditor: SelectCellEditor,
        cellEditorParams: { options: ROLES },
        valueFormatter: (p) => ROLES.find((r) => r.value === p.value)?.label ?? '',
      },
      {
        field: 'team',
        headerName: '소속팀',
        editable: true,
        cellEditor: SelectCellEditor,
        cellEditorParams: { options: TEAMS },
        valueFormatter: (p) => TEAMS.find((t) => t.value === p.value)?.label ?? '',
      },
      {
        field: 'vendorCode',
        headerName: '거래처 (검색)',
        editable: true,
        cellEditor: SearchCellEditor,
        cellEditorParams: {
          onSearch: searchVendors,
          toLabel: (code: string) => VENDOR_NAME[code] ?? '',
          onError: (e: unknown) => console.error('거래처 조회 실패', e),
        },
        valueFormatter: (p) => VENDOR_NAME[p.value as string] ?? '',
      },
      { field: 'memo', headerName: '비고', editable: true },
      // 자동 추론: number -> 우측 정렬 + 콤마
      { field: 'qty', headerName: '수량' },
      // 소수는 자동 추론이 number 라서 직접 지정한다
      { field: 'price', headerName: '단가', context: { excelType: 'decimal' } },
      // '2026-09-07' -> date 로 추론
      { field: 'regDate', headerName: '등록일' },
      // 앞자리 0 이 살아 있어야 한다 (숫자로 변환되면 안 된다)
      { field: 'zipCode', headerName: '우편번호' },
      // '=' '@' 로 시작하는 값이 수식으로 실행되면 안 된다
      { field: 'risky', headerName: '위험값' },
    ];

    if (!manyColumns) return base;
    return [
      ...base,
      { field: 'phone', headerName: '연락처', editable: true },
      { field: 'city', headerName: '지역', editable: true },
      { field: 'grade', headerName: '등급', editable: true },
      // 폭 초과를 만들려고 minWidth 가 큰 컬럼을 덧붙인다
      ...Array.from({ length: 8 }, (_, i) => ({
        colId: `filler${i}`,
        headerName: `추가컬럼 ${i + 1}`,
        valueGetter: () => '값',
        minWidth: 180,
      })),
    ];
  }, [manyColumns]);

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Switch checked={manyColumns} onChange={setManyColumns} />
        <span>컬럼 많이 (켜면 minWidth 합계가 화면을 넘겨 가로 스크롤이 생겨야 한다)</span>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={() => download({ sheetName: '사용자목록' })}>
          엑셀 다운로드 (화면 그대로)
        </Button>
        <Button onClick={() => download({ sheetName: '사용자목록', rows: 'all' })}>
          전체 행
        </Button>
        <Button onClick={() => download({ sheetName: '선택행', onlySelected: true })}>
          선택 행만
        </Button>
        <Button
          onClick={() =>
            download({
              sheetName: '컬럼지정',
              columns: ['name', { colId: 'qty', header: '출고수량', width: 140 }, 'price'],
            })
          }
        >
          컬럼 지정 (이름·수량·단가)
        </Button>
      </Space>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        아무 셀이나 더블클릭하거나 Enter 로 편집을 시작한 뒤 방향키로 확인한다.
        <br />
        <Tag>권한/소속팀</Tag> 포커스가 들어간 칸만 드롭다운이 열려야 한다 (행의 다른 select 는 닫힌
        채로).
        <br />
        <Tag>↑ ↓</Tag> 드롭다운이 열려 있으면 옵션 이동, 닫혀 있으면 편집 행 이동. 첫/마지막 행에서는
        멈춘다.
        <br />
        <Tag>← →</Tag> 글자가 남아 있으면 캐럿 이동, 텍스트 끝에 닿으면 옆 칸으로. 행의 첫/마지막
        칸에서는 멈춘다.
        <br />
        <Tag>거래처</Tag> 두 글자쯤 입력하면 400ms 뒤 목록이 뜬다 (조회 로그는 콘솔).
      </Typography.Paragraph>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        <strong>엑셀 확인 항목</strong> — 수량/단가는 우측 정렬 + 콤마, 등록일은 날짜 셀,
        우편번호는 앞자리 0 유지, 위험값(<code>=1+1</code>, <code>@SUM(...)</code>)은 수식이 아닌
        텍스트로 들어가야 한다. 체크박스·숨김 컬럼은 빠져야 한다.
      </Typography.Paragraph>

      <CommonGrid<Row>
        rowData={rows}
        columnDefs={columnDefs}
        editType="fullRow"
        pagination={false}
        height={480}
        rowSelection={{ mode: 'multiRow' }}
        onGridReady={(e) => {
          apiRef.current = e.api;
        }}
        onRowValueChanged={(e) => {
          console.log('[onRowValueChanged]', e.data);
          setLastSaved(`${e.data?.name} / ${new Date().toLocaleTimeString('ko-KR')}`);
        }}
      />

      <Typography.Paragraph style={{ marginTop: 12 }}>
        마지막 저장된 행: <strong>{lastSaved}</strong>
      </Typography.Paragraph>
    </div>
  );
}

