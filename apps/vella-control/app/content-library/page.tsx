"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2, Edit2 } from "lucide-react";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContentLibraryItem, ContentItemType } from "@/lib/admin/contentLibrary";

const CONTENT_TYPES: ContentItemType[] = ["persona", "script", "template", "story", "habit", "emotion"];

export default function ContentLibraryPage() {
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ContentLibraryItem[]>([]);
  const [selectedType, setSelectedType] = useState<ContentItemType | "all">("all");
  const [selectedItem, setSelectedItem] = useState<ContentLibraryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // New item form state
  const [newItem, setNewItem] = useState({
    label: "",
    type: "persona" as ContentItemType,
    body: "",
    tags: "",
    is_active: true,
  });

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/content-library/list", { cache: "no-store" });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json.error ?? "Failed to load content library");
        }

        setItems(json.data ?? []);
      } catch (err) {
        console.error("[ContentLibraryPage] Failed to load items", err);
        setError(err instanceof Error ? err.message : "Failed to load content library");
      } finally {
        setIsLoading(false);
      }
    };

    void loadItems();
  }, []);

  useEffect(() => {
    if (selectedType === "all") {
      setFilteredItems(items);
    } else {
      setFilteredItems(items.filter((item) => item.config.type === selectedType));
    }
  }, [items, selectedType]);

  const handleItemClick = (item: ContentLibraryItem) => {
    setSelectedItem(item);
    setIsEditorOpen(true);
  };

  const handleSave = async () => {
    if (!selectedItem) return;

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/admin/content-library/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedItem.id,
          label: selectedItem.label,
          config: selectedItem.config,
          is_active: selectedItem.is_active,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Failed to update content item");
      }

      // Update local state
      setItems((prev) => prev.map((item) => (item.id === selectedItem.id ? json.data : item)));
      setSelectedItem(json.data);
      setSaveMessage("Item saved successfully");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error("[ContentLibraryPage] Failed to save item", err);
      setError(err instanceof Error ? err.message : "Failed to save content item");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!confirm(`Are you sure you want to delete "${selectedItem.label}"?`)) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/content-library/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedItem.id }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Failed to delete content item");
      }

      // Update local state
      setItems((prev) => prev.filter((item) => item.id !== selectedItem.id));
      setIsEditorOpen(false);
      setSelectedItem(null);
    } catch (err) {
      console.error("[ContentLibraryPage] Failed to delete item", err);
      setError(err instanceof Error ? err.message : "Failed to delete content item");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreate = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const tags = newItem.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const response = await fetch("/api/admin/content-library/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newItem.label,
          config: {
            type: newItem.type,
            body: newItem.body,
            tags: tags.length > 0 ? tags : undefined,
          },
          is_active: newItem.is_active,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Failed to create content item");
      }

      // Update local state
      setItems((prev) => [json.data, ...prev]);
      setIsNewItemDialogOpen(false);
      setNewItem({ label: "", type: "persona", body: "", tags: "", is_active: true });
    } catch (err) {
      console.error("[ContentLibraryPage] Failed to create item", err);
      setError(err instanceof Error ? err.message : "Failed to create content item");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-8 text-[var(--vc-text)]">
      <SectionHeader
        title="Content Library"
        description="Manage personas, scripts, templates, stories, habits, and emotion content."
        actions={
          <Button onClick={() => setIsNewItemDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New Item
          </Button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-500">
          {saveMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        {/* Sidebar filters */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Filter by Type</h3>
          <Button
            variant={selectedType === "all" ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() => setSelectedType("all")}
          >
            All
          </Button>
          {CONTENT_TYPES.map((type) => (
            <Button
              key={type}
              variant={selectedType === type ? "default" : "outline"}
              className="w-full justify-start capitalize"
              onClick={() => setSelectedType(type)}
            >
              {type}
            </Button>
          ))}
        </div>

        {/* Main content */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading content...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No content items found</div>
          ) : (
            <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] backdrop-blur-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => handleItemClick(item)}
                    >
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell className="capitalize">{item.config.type}</TableCell>
                      <TableCell>
                        {item.is_active ? (
                          <span className="text-green-500">Active</span>
                        ) : (
                          <span className="text-muted-foreground">Inactive</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(item.updated_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleItemClick(item);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Content Item</DialogTitle>
            <DialogDescription>Update the content item details</DialogDescription>
          </DialogHeader>

          {selectedItem ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Label</label>
                <Input
                  value={selectedItem.label}
                  onChange={(e) =>
                    setSelectedItem({ ...selectedItem, label: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedItem.config.type}
                  onChange={(e) =>
                    setSelectedItem({
                      ...selectedItem,
                      config: { ...selectedItem.config, type: e.target.value as ContentItemType },
                    })
                  }
                >
                  {CONTENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Active</label>
                  <p className="text-xs text-muted-foreground">Enable this content item</p>
                </div>
                <Switch
                  checked={selectedItem.is_active}
                  onCheckedChange={(checked) =>
                    setSelectedItem({ ...selectedItem, is_active: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Body</label>
                <Textarea
                  value={selectedItem.config.body}
                  onChange={(e) =>
                    setSelectedItem({
                      ...selectedItem,
                      config: { ...selectedItem.config, body: e.target.value },
                    })
                  }
                  rows={10}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tags (comma-separated)</label>
                <Input
                  value={selectedItem.config.tags?.join(", ") ?? ""}
                  onChange={(e) =>
                    setSelectedItem({
                      ...selectedItem,
                      config: {
                        ...selectedItem.config,
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  placeholder="tag1, tag2, tag3"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Item Dialog */}
      <Dialog open={isNewItemDialogOpen} onOpenChange={setIsNewItemDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Content Item</DialogTitle>
            <DialogDescription>Add a new content item to the library</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Label</label>
              <Input
                value={newItem.label}
                onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                placeholder="Content item title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newItem.type}
                onChange={(e) => setNewItem({ ...newItem, type: e.target.value as ContentItemType })}
              >
                {CONTENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Active</label>
                <p className="text-xs text-muted-foreground">Enable this content item</p>
              </div>
              <Switch
                checked={newItem.is_active}
                onCheckedChange={(checked) => setNewItem({ ...newItem, is_active: checked })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Body</label>
              <Textarea
                value={newItem.body}
                onChange={(e) => setNewItem({ ...newItem, body: e.target.value })}
                rows={10}
                placeholder="Content body text"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tags (comma-separated)</label>
              <Input
                value={newItem.tags}
                onChange={(e) => setNewItem({ ...newItem, tags: e.target.value })}
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewItemDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving || !newItem.label || !newItem.body}>
              <Plus className="h-4 w-4" />
              {isSaving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
