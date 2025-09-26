export default function Input({ type, placeholder, label, onchange }: any) {
  return (
    <div className="flex flex-col gap-5">
      <input
        className="py-3 px-10"
        type={type}
        placeholder={placeholder}
        onChange={() => onchange}
      />
    </div>
  );
}
