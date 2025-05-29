// UserController_getUserList.jsx

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

// Hook to grab props passed from server
function useServerProps() {
  return window.__PROPS__ || {};
}

function UserController_getUserList() {
  const props = useServerProps();

  // Assume props.users is the array of user data

  // Define columns
  const columns = useMemo(
    () => [
      {
        header: "ID",
        accessorKey: "id",
      },
      {
        header: "Name",
        accessorKey: "name",
      },
    ],
    []
  );

  const table = useReactTable({
    data: props.data.users,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        User List from /user/list
      </h1>

      <p className="text-gray-600">
        You are logged in as{" "}
        <span className="font-semibold">{props.data.currentUser.name}</span>
      </p>

      <div className="w-full max-w-4xl bg-white shadow-md rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">User Table</h2>
        <table className="min-w-full table-auto border border-gray-300">
          <thead className="bg-gray-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-100">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-2 text-sm text-gray-600 border-b"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GhantaComponent />
    </div>
  );
}

function GhantaComponent() {
  const [counter, setCounter] = useState(0);

  return (
    <button
      className="w-60 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      onClick={() => setCounter(counter + 1)}
    >
      Increment Counter {counter}
    </button>
  );
}
