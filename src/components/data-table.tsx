"use client";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { Button } from "./ui/button";
export function DataTable<T>({
  rows,
  columns,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // TanStack Table is intentionally outside React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id}>
                    <button
                      className="th-button"
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc"
                        ? " ↑"
                        : h.column.getIsSorted() === "desc"
                          ? " ↓"
                          : ""}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">لا توجد سجلات لعرضها</div>}
      </div>
      <div className="pagination">
        <span>{rows.length} سجل</span>
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            السابق
          </Button>
          <span>
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            التالي
          </Button>
        </div>
      </div>
    </>
  );
}
