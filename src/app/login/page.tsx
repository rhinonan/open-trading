import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
          加载中…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
