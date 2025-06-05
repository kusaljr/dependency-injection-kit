// UserController_getUserList.jsx

import { Button, Table } from "antd";
import { useState } from "react";
// Hook to grab props passed from server

const columns = [
  {
    title: "ID",
    dataIndex: "id",
    key: "id",
  },
  {
    title: "Name",
    dataIndex: "name",
    key: "name",
  },
];

export default function UserController_getUserList({ props }: { props: any }) {
  console.log("UserController_getUserList props:", props);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        User List from /user/list
      </h1>
      <p className="text-gray-600">
        You are logged in as {props.data.currentUser.name}
      </p>
      <SadComponent />
      <Table dataSource={props.data.users} columns={columns} />;
    </div>
  );
}

function SadComponent() {
  const [counter, setCounter] = useState(0);

  return (
    <Button onClick={() => setCounter(counter + 1)}>
      Increment Counter {counter}
    </Button>
  );
}
