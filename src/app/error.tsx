"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold">页面加载出错</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "发生了未知错误，请重试"}
          </p>
          <Button onClick={reset} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            重新加载
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
