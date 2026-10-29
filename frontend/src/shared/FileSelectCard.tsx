import type { ChangeEvent, ReactNode } from "react";

type FileSelectCardProps = {
  iconText?: string;
  title: string;
  fileName?: string;
  emptyLabel?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  onFileChange: (file: File | undefined, event: ChangeEvent<HTMLInputElement>) => void;
  action?: ReactNode;
};

export default function FileSelectCard({
  iconText = "FILE", title, fileName, emptyLabel = "No file selected", accept,
  disabled = false, className = "", onFileChange, action,
}: FileSelectCardProps) {
  return (
    <label className={`configuration-upload-card ${className}`.trim()}>
      <span className="configuration-upload-icon" aria-hidden="true">{iconText}</span>
      <span className="configuration-upload-copy">
        <strong>{title}</strong>
        <small>{fileName ?? emptyLabel}</small>
      </span>
      <span className="configuration-browse-button">Browse file</span>
      <input type="file" accept={accept} disabled={disabled} onChange={(event) => onFileChange(event.target.files?.[0], event)} />
      {action}
    </label>
  );
}
