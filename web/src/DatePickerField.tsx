import { DayPicker } from "@daypicker/react";
import { CalendarDays, X } from "lucide-react";
import { useId, useState } from "react";

import { enUS, id as idLocale } from "@daypicker/react/locale";
import { formatDisplayDate, type Translator } from "./i18n";
import type { AppData } from "./types";

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  language: AppData["language"];
  t: Translator;
  min?: string;
  max?: string;
  defaultMonth?: Date;
  className?: string;
  initiallyOpen?: boolean;
}

export const parseIsoDate = (value: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? date
    : undefined;
};

export const formatIsoDate = (date: Date): string => [
  String(date.getFullYear()).padStart(4, "0"),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0")
].join("-");

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

export function DatePickerField({
  label,
  value,
  onChange,
  language,
  t,
  min,
  max,
  defaultMonth,
  className = "",
  initiallyOpen = false
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const labelId = useId();
  const selected = parseIsoDate(value);
  const minDate = parseIsoDate(min ?? "") ?? new Date(1800, 0, 1);
  const maxDate = parseIsoDate(max ?? "") ?? new Date();
  const today = new Date();
  const todayValue = formatIsoDate(today);
  const todayAllowed = todayValue >= formatIsoDate(minDate) &&
    todayValue <= formatIsoDate(maxDate);
  const initialMonth = selected ?? defaultMonth ?? maxDate;

  return (
    <div className={`field date-picker-field ${className}`.trim()}>
      <span id={labelId}>{label}</span>
      <div className="date-picker-control">
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`date-picker-trigger ${value ? "has-value" : ""}`}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <CalendarDays aria-hidden="true" size={18} />
          <span>{value ? formatDisplayDate(value, language) : t("chooseDate")}</span>
        </button>
        {value ? (
          <button
            aria-label={`${t("clearDate")}: ${label}`}
            className="date-picker-clear"
            onClick={() => onChange("")}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        ) : null}
      </div>

      {open ? (
        <>
          <button
            aria-label={t("closeDatePicker")}
            className="date-picker-dismiss"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div aria-labelledby={labelId} className="date-picker-popover" role="dialog">
            <DayPicker
              autoFocus
              captionLayout="dropdown"
              defaultMonth={initialMonth}
              disabled={{ before: minDate, after: maxDate }}
              endMonth={monthEnd(maxDate)}
              fixedWeeks
              locale={language === "id" ? idLocale : enUS}
              mode="single"
              navLayout="after"
              onSelect={(date) => {
                if (!date) return;
                onChange(formatIsoDate(date));
                setOpen(false);
              }}
              reverseYears
              selected={selected}
              showOutsideDays
              startMonth={monthStart(minDate)}
            />
            <div className="date-picker-actions">
              <button
                className="date-picker-action"
                disabled={!value}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                type="button"
              >
                {t("clearDate")}
              </button>
              {todayAllowed ? (
                <button
                  className="date-picker-action primary"
                  onClick={() => {
                    onChange(todayValue);
                    setOpen(false);
                  }}
                  type="button"
                >
                  {t("today")}
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
