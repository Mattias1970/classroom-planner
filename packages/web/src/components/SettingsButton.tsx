import React from "react";
import { GearIcon } from "./GearIcon";

export interface SettingsButtonProps {
  onClick: () => void;
  /** Om inställningspanelen är öppen (för aria-expanded). */
  isOpen?: boolean;
}

/**
 * Kugghjulsknapp för appens header. Öppnar inställningspanelen.
 */
export function SettingsButton({
  onClick,
  isOpen = false,
}: SettingsButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Inställningar"
      aria-expanded={isOpen}
      title="Inställningar"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        padding: 0,
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        background: isOpen ? "#eef2f6" : "#ffffff",
        color: "#344054",
        cursor: "pointer",
      }}
    >
      <GearIcon size={20} title="Inställningar" />
    </button>
  );
}
