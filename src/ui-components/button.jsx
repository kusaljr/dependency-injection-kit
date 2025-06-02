import { Button as BaseButton } from "antd";

export function Button({ children, className = "", ...props }) {
  return (
    <BaseButton
      className={`bg-blue-500 text-white hover:bg-blue-600 ${className}`}
      {...props}
    >
      {children}
    </BaseButton>
  );
}
