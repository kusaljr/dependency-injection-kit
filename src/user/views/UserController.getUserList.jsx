// UserController_getUserList.jsx

import { useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

// Hook to grab props passed from server
function useServerProps() {
  return window.__PROPS__ || {};
}

const position = [51.505, -0.09];

function UserController_getUserList() {
  const props = useServerProps();
  const [counter, setCounter] = useState(0);

  return (
    <div>
      <h1>Data from /user/list</h1>
      <div>
        <h2>Server Data:</h2>
        <pre>{JSON.stringify(props, null, 2)}</pre>
      </div>
      <button onClick={() => setCounter(counter + 1)}>
        Increment Counter: {counter}
      </button>
      <div style={{ height: "500px", width: "100%", marginTop: "20px" }}>
        <MapContainer
          center={position}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={position}>
            <Popup>
              A pretty CSS3 popup. <br /> Easily customizable. Hello World
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}
