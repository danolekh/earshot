/* tablecn's faceted filter, with local edits (re-apply after `shadcn add --overwrite`): the trigger
 * shows how many values are picked in a slot that's always there (so picking never shifts the
 * toolbar), not their labels, and no clear control nested in the trigger button (clearing is in
 * the popover); options show their count even at 0, dimmed then; the popover grows to its
 * options' names. */
"use client";

import { type Column, type ColumnFiltersState, type RowData, Subscribe } from "@tanstack/react-table";
import { cn } from "cn";
import { PlusCircle, Check } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { DataTableFeatures } from "@/lib/data-table-features";
import type { Option } from "@/lib/data-table-types";

interface DataTableFacetedFilterProps<TData extends RowData, TValue> {
  column?: Column<DataTableFeatures, TData, TValue>;
  title?: string;
  options: Option[];
  multiple?: boolean;
}

export function DataTableFacetedFilter<TData extends RowData, TValue>({
  column,
  ...props
}: DataTableFacetedFilterProps<TData, TValue>) {
  if (!column) {
    return <DataTableFacetedFilterContent column={column} {...props} />;
  }

  return (
    <Subscribe
      source={column.table.atoms.columnFilters}
      selector={(filters: ColumnFiltersState) => filters.find((filter) => filter.id === column.id)?.value}
    >
      {(columnFilterValue) => (
        <DataTableFacetedFilterContent column={column} columnFilterValue={columnFilterValue} {...props} />
      )}
    </Subscribe>
  );
}

function DataTableFacetedFilterContent<TData extends RowData, TValue>({
  column,
  title,
  options,
  multiple,
  columnFilterValue,
}: DataTableFacetedFilterProps<TData, TValue> & {
  columnFilterValue?: unknown;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedValues = React.useMemo(
    () => new Set(Array.isArray(columnFilterValue) ? columnFilterValue : []),
    [columnFilterValue],
  );

  const onItemSelect = React.useCallback(
    (option: Option, isSelected: boolean) => {
      if (!column) return;

      if (multiple) {
        const newSelectedValues = new Set(selectedValues);
        if (isSelected) {
          newSelectedValues.delete(option.value);
        } else {
          newSelectedValues.add(option.value);
        }
        const filterValues = Array.from(newSelectedValues);
        column.setFilterValue(filterValues.length ? filterValues : undefined);
      } else {
        column.setFilterValue(isSelected ? undefined : [option.value]);
        setOpen(false);
      }
    },
    [column, multiple, selectedValues],
  );

  const onReset = React.useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      column?.setFilterValue(undefined);
    },
    [column],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="border-dashed font-normal" />}>
        {/* One icon either way: clearing is in the popover (and Reset), not a control nested in
            this button. */}
        <PlusCircle aria-hidden />
        {title}
        {/* Always there, hidden until something is picked: picking never moves what follows. */}
        <span
          aria-hidden={selectedValues.size === 0}
          className={cn("flex items-center gap-1.5", selectedValues.size === 0 && "invisible")}
        >
          <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
          <Badge
            variant="secondary"
            className="min-w-5 justify-center rounded-sm px-1 font-mono font-normal tabular-nums"
          >
            {selectedValues.size}
          </Badge>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-80 min-w-50 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList className="max-h-full">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup className="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto">
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);

                return (
                  <CommandItem
                    key={option.value}
                    data-empty={option.count === 0 && !isSelected ? "" : undefined}
                    className="data-empty:opacity-50 [&>svg:last-child]:hidden"
                    onSelect={() => onItemSelect(option, isSelected)}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-primary",
                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check />
                    </div>
                    {option.icon && <option.icon />}
                    <span className="truncate">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="ml-auto font-mono text-xs tabular-nums">{option.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onReset()} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
