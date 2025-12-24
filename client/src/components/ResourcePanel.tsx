import { useState } from "react";
import { FileText, Upload, Eye, Trash2, Plus, Target, Cpu } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format } from "date-fns";
import type { Resource } from "@shared/schema";

const resourceFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name is too long"),
  content: z.string().min(1, "Content is required"),
});

type ResourceFormValues = z.infer<typeof resourceFormSchema>;

interface ResourcePanelProps {
  targetSpecs: Resource[];
  technicalAssets: Resource[];
  onAddResource: (type: "target_spec" | "technical_assets", name: string, content: string) => void;
  onDeleteResource: (id: number) => void;
  isPending?: boolean;
}

export function ResourcePanel({
  targetSpecs,
  technicalAssets,
  onAddResource,
  onDeleteResource,
  isPending,
}: ResourcePanelProps) {
  const [targetOpen, setTargetOpen] = useState(true);
  const [assetsOpen, setAssetsOpen] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [addType, setAddType] = useState<"target_spec" | "technical_assets">("target_spec");
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: "",
      content: "",
    },
  });

  const handleAddClick = (type: "target_spec" | "technical_assets") => {
    setAddType(type);
    form.reset({ name: "", content: "" });
    setAddDialogOpen(true);
  };

  const handleAddSubmit = (values: ResourceFormValues) => {
    onAddResource(addType, values.name, values.content);
    setAddDialogOpen(false);
    form.reset();
  };

  const handlePreview = (resource: Resource) => {
    setPreviewResource(resource);
    setPreviewDialogOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      form.setValue("content", content);
      if (!form.getValues("name")) {
        form.setValue("name", file.name.replace(/\.[^/.]+$/, ""));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resources
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-3">
            <div className="space-y-4">
              <Collapsible open={targetOpen} onOpenChange={setTargetOpen}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate active-elevate-2 px-2 py-1 rounded-md -ml-2">
                    <Target className="h-4 w-4 text-primary" />
                    Target Specifications ({targetSpecs.length})
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleAddClick("target_spec")}
                    data-testid="button-add-target-spec"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <CollapsibleContent className="space-y-2">
                  {targetSpecs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 px-2">
                      No target specifications yet. Click + to add one.
                    </p>
                  ) : (
                    targetSpecs.map((resource) => (
                      <ResourceItem
                        key={resource.id}
                        resource={resource}
                        onPreview={handlePreview}
                        onDelete={onDeleteResource}
                      />
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={assetsOpen} onOpenChange={setAssetsOpen}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate active-elevate-2 px-2 py-1 rounded-md -ml-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    Technical Assets ({technicalAssets.length})
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleAddClick("technical_assets")}
                    data-testid="button-add-technical-assets"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <CollapsibleContent className="space-y-2">
                  {technicalAssets.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 px-2">
                      No technical assets yet. Click + to add one.
                    </p>
                  ) : (
                    technicalAssets.map((resource) => (
                      <ResourceItem
                        key={resource.id}
                        resource={resource}
                        onPreview={handlePreview}
                        onDelete={onDeleteResource}
                      />
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAddSubmit)}>
              <DialogHeader>
                <DialogTitle>
                  Add {addType === "target_spec" ? "Target Specification" : "Technical Assets"}
                </DialogTitle>
                <DialogDescription>
                  {addType === "target_spec"
                    ? "Add the target market and customer specification text."
                    : "Add your technical asset list (JSON or text format)."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter resource name..."
                          data-testid="input-resource-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Content</FormLabel>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".txt,.json,.md"
                            onChange={handleFileUpload}
                          />
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <span>
                              <Upload className="h-3.5 w-3.5" />
                              Upload File
                            </span>
                          </Button>
                        </label>
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder="Paste or type content here..."
                          rows={12}
                          className="font-mono text-sm"
                          data-testid="input-resource-content"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-submit-resource"
                >
                  {isPending ? "Adding..." : "Add Resource"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewResource?.name}
            </DialogTitle>
            <DialogDescription>
              {previewResource?.type === "target_spec" ? "Target Specification" : "Technical Assets"} •{" "}
              {previewResource?.createdAt && format(new Date(previewResource.createdAt), "yyyy/MM/dd HH:mm")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] rounded-md border bg-muted/30 p-4">
            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
              {previewResource?.content}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResourceItem({
  resource,
  onPreview,
  onDelete,
}: {
  resource: Resource;
  onPreview: (r: Resource) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="group flex items-center justify-between gap-2 rounded-md border bg-card p-2.5 hover-elevate"
      data-testid={`resource-item-${resource.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" data-testid={`text-resource-name-${resource.id}`}>
          {resource.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(resource.createdAt), "yyyy/MM/dd")}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPreview(resource)}
          data-testid={`button-preview-resource-${resource.id}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onDelete(resource.id)}
          data-testid={`button-delete-resource-${resource.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
