"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type InlineEditableTextProps = {
  value: string;
  displayValue?: string;
  canEdit: boolean;
  onSave: (nextValue: string) => Promise<string | null | undefined>;
  renderDisplay: (args: {
    displayValue: string;
    canEdit: boolean;
    isSaving: boolean;
    startEditing: () => void;
  }) => ReactNode;
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  maxLength?: number;
  allowEmpty?: boolean;
  emptyValueMessage?: string;
  maxLengthMessage?: string;
};

export function InlineEditableText({
  value,
  displayValue,
  canEdit,
  onSave,
  renderDisplay,
  ariaLabel,
  className,
  inputClassName,
  placeholder,
  maxLength,
  allowEmpty = false,
  emptyValueMessage = "This field cannot be empty.",
  maxLengthMessage,
}: InlineEditableTextProps) {
  const [committedValue, setCommittedValue] = useState(value);
  const [draftValue, setDraftValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCommittedValue(value);
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const resolvedDisplayValue = (displayValue ?? committedValue) || placeholder || "Untitled";

  const startEditing = () => {
    if (!canEdit || isSaving) {
      return;
    }

    setDraftValue(committedValue);
    setErrorMessage(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (isSaving) {
      return;
    }

    setDraftValue(committedValue);
    setErrorMessage(null);
    setIsEditing(false);
  };

  const saveDraft = async () => {
    if (isSaving) {
      return;
    }

    const normalizedValue = draftValue.trim();
    if (!allowEmpty && normalizedValue.length === 0) {
      setErrorMessage(emptyValueMessage);
      return;
    }

    if (typeof maxLength === "number" && normalizedValue.length > maxLength) {
      setErrorMessage(maxLengthMessage ?? `${ariaLabel} must be ${maxLength} characters or fewer.`);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const savedValue = await onSave(normalizedValue);
      const nextValue = savedValue ?? normalizedValue;
      const normalizedCommittedValue = nextValue ?? "";
      setCommittedValue(normalizedCommittedValue);
      setDraftValue(normalizedCommittedValue);
      setIsEditing(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save right now.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={className}>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={draftValue}
          aria-label={ariaLabel}
          placeholder={placeholder}
          maxLength={maxLength}
          onBlur={cancelEditing}
          onChange={(event) => {
            setDraftValue(event.currentTarget.value);
            if (errorMessage) {
              setErrorMessage(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveDraft();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditing();
            }
          }}
          className={inputClassName}
          disabled={isSaving}
        />
      ) : (
        renderDisplay({
          displayValue: resolvedDisplayValue,
          canEdit,
          isSaving,
          startEditing,
        })
      )}
      {errorMessage ? <p className="mt-2 text-sm text-rose-400">{errorMessage}</p> : null}
    </div>
  );
}