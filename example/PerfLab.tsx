import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Radio, Space, Switch, Table, Tag, Typography } from 'antd';
import type { GridApi } from 'ag-grid-community';
import { CommonGrid } from '../src/components/grid/CommonGrid';
import { exportGridToExcel, type ExcelColDef } from '../src/lib/excelExport';
import { internStrings } from '../src/lib/internStrings';

const COLUMN_COUNT = 30;

/** 실무형 분포: 저카디널리티(코드·부서·날짜) + 고카디널리티(품명) + 숫자 */
const STATUS = ['대기', '승인', '반려', '보류', '완료'];
const DEPT = Array.from({ length: 40 }, (_, i) => `사업부-${i}`);

type PerfRow = Record<string, string | number>;

function makeRows(count: number): PerfRow[] {
  const rows: PerfRow[] = new Array(count);
  for (let r = 0; r < count; r++) {
    const row: PerfRow = {};
    for (let c = 0; c < COLUMN_COUNT; c++) {
      const key = `c${c}`;
      if (c % 5 === 0) row[key] = STATUS[r % STATUS.length];
      else if (c % 5 === 1) row[key] = DEPT[r % DEPT.length];
      else if (c % 5 === 2) row[key] = `2026-${String((c % 12) + 1).padStart(2, '0')}-${String((r % 28) + 1).padStart(2, '0')}`;
      else if (c % 5 === 3) row[key] = (r * (c + 1)) % 1_000_000;
      else row[key] = `품목-${(r * 7919) % count}-${c}`;
    }
    rows[r] = row;
  }
  return rows;
}

/** Chrome 전용. 없으면 undefined */
function heapMB(): number | undefined {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : undefined;
}

interface Measurement {
  key: string;
  작업: string;
  시간: string;
  힙: string;
  비고: string;
}

export function PerfLab() {
  const apiRef = useRef<GridApi<PerfRow> | null>(null);
  const [rowCount, setRowCount] = useState(80_000);
  const [useInterning, setUseInterning] = useState(true);
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [log, setLog] = useState<Measurement[]>([]);

  const columnDefs = useMemo<ExcelColDef<PerfRow>[]>(
    () =>
      Array.from({ length: COLUMN_COUNT }, (_, c) => ({
        field: `c${c}`,
        headerName: `컬럼${c}`,
        minWidth: 120,
      })),
    [],
  );

  const record = (작업: string, ms: number, 비고 = '') => {
    const mb = heapMB();
    setLog((prev) => [
      ...prev,
      {
        key: `${작업}-${prev.length}`,
        작업,
        시간: `${ms.toFixed(0)} ms`,
        힙: mb == null ? '-' : `${mb} MB`,
        비고,
      },
    ]);
  };

  /** 동기 작업을 재고 UI 가 멈추는 것을 그대로 보여 준다 */
  const measure = (작업: string, fn: () => string | void) => {
    const start = performance.now();
    const note = fn();
    record(작업, performance.now() - start, note ?? '');
  };

  const loadData = () => {
    setLog([]);
    const t0 = performance.now();
    const generated = makeRows(rowCount);
    record('데이터 생성', performance.now() - t0, `${rowCount.toLocaleString()}행 x ${COLUMN_COUNT}컬럼`);

    if (useInterning) {
      const t1 = performance.now();
      internStrings(generated);
      record('internStrings', performance.now() - t1, '반복 문자열 병합');
    }

    const t2 = performance.now();
    setRows(generated);
    // 그리드 반영은 다음 프레임에 끝난다
    requestAnimationFrame(() =>
      requestAnimationFrame(() => record('그리드 로드', performance.now() - t2)),
    );
  };

  const sortBy = (colId: string, label: string) => {
    const api = apiRef.current;
    if (!api) return;
    measure(label, () => {
      api.applyColumnState({ state: [{ colId, sort: 'asc' }], defaultState: { sort: null } });
    });
  };

  const download = (label: string, columns?: string[]) => {
    const api = apiRef.current;
    if (!api) return;
    measure(label, () => {
      exportGridToExcel(api, { sheetName: '성능테스트', columns });
      return columns ? `${columns.length}컬럼` : `${COLUMN_COUNT}컬럼`;
    });
  };

  const loaded = rows.length > 0;

  return (
    <div>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="측정 중 화면이 멈춘다"
        description="전부 동기 작업이라 실행 중에는 브라우저가 응답하지 않는다. MSA 포탈이라면 이 시간 동안 다른 탭의 앱도 같이 멈춘다 — 그게 이 테스트의 요점이다."
      />

      <Space wrap style={{ marginBottom: 12 }}>
        <Radio.Group
          value={rowCount}
          onChange={(e) => setRowCount(e.target.value)}
          optionType="button"
          options={[
            { label: '10,000행', value: 10_000 },
            { label: '50,000행', value: 50_000 },
            { label: '80,000행', value: 80_000 },
          ]}
        />
        <Space>
          <Switch checked={useInterning} onChange={setUseInterning} />
          <span>internStrings 적용</span>
        </Space>
        <Button type="primary" onClick={loadData}>
          데이터 생성 + 로드
        </Button>
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Button disabled={!loaded} onClick={() => sortBy('c3', '정렬 (숫자 컬럼)')}>
          정렬: 숫자
        </Button>
        <Button disabled={!loaded} onClick={() => sortBy('c4', '정렬 (문자열 컬럼)')}>
          정렬: 문자열
        </Button>
        <Button danger disabled={!loaded} onClick={() => download('엑셀 (전체 컬럼)')}>
          엑셀 다운로드 (30컬럼)
        </Button>
        <Button
          disabled={!loaded}
          onClick={() => download('엑셀 (5컬럼)', ['c0', 'c1', 'c2', 'c3', 'c4'])}
        >
          엑셀 다운로드 (5컬럼)
        </Button>
      </Space>

      <Typography.Paragraph type="secondary">
        힙 수치는 Chrome 의 <code>performance.memory</code> 기준이라 대략값이고 GC 시점에 따라
        출렁인다. <Tag>internStrings</Tag> 를 껐다 켜서 같은 행 수로 두 번 재면 차이가 보인다.
      </Typography.Paragraph>

      {log.length > 0 && (
        <Table<Measurement>
          size="small"
          pagination={false}
          dataSource={log}
          style={{ marginBottom: 16, maxWidth: 720 }}
          columns={[
            { title: '작업', dataIndex: '작업' },
            { title: '시간', dataIndex: '시간', align: 'right' },
            { title: '힙(누적)', dataIndex: '힙', align: 'right' },
            { title: '비고', dataIndex: '비고' },
          ]}
        />
      )}

      <CommonGrid<PerfRow>
        rowData={rows}
        columnDefs={columnDefs}
        height={420}
        pagination={false}
        onGridReady={(e) => {
          apiRef.current = e.api;
        }}
      />
    </div>
  );
}
