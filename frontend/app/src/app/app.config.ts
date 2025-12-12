import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { backendStatusInterceptor } from './interceptors/backend-status.interceptor';
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor, backendStatusInterceptor])
    ),
    importProvidersFrom(NgxDaterangepickerMd.forRoot())
  ],
};