export default function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${
            toast.type === "hint"
              ? "bg-blue-600"
              : toast.type === "success"
                ? "bg-green-600"
                : toast.type === "error"
                  ? "bg-red-600"
                  : toast.type === "motivation"
                    ? "bg-purple-600"
                    : "bg-gray-800"
          }`}
        >
          {toast.type === "hint" && "💡 "}
          {toast.type === "success" && "✅ "}
          {toast.type === "error" && "❌ "}
          {toast.type === "motivation" && "🚀 "}
          {toast.message}
        </div>
      ))}
    </div>
  )
}
