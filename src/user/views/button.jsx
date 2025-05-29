export function Button({ children, className = "", ...props }) {
  return (
    <button
      className={`w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-200 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
