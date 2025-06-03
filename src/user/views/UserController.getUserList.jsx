// UserController_getUserList.jsx

import { Button } from "antd";
import { useState } from "react";
// Hook to grab props passed from server

export default function UserController_getUserList({ props }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        User List from /user/list
      </h1>

      <p className="text-gray-600">You are logged in as </p>

      <GhantaComponent />
    </div>
  );
}

function GhantaComponent() {
  const [counter, setCounter] = useState(0);

  return (
    <Button onClick={() => setCounter(counter + 1)}>
      Increment Counter {counter}
    </Button>
  );
}
