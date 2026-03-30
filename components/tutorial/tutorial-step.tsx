export function TutorialStep({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative">
      <input
        type="checkbox"
        id={title}
        name={title}
        className={`checkbox checkbox-sm absolute top-[3px] mr-2 peer`}
      />
      <label
        htmlFor={title}
        className={`relative text-base text-base-content peer-checked:line-through font-medium`}
      >
        <span className="ml-8">{title}</span>
        <div
          className={`ml-8 text-sm peer-checked:line-through font-normal text-base-content/70`}
        >
          {children}
        </div>
      </label>
    </li>
  );
}
