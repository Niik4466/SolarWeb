// src/app/services/mail.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

const API_BASE = 'http://127.0.0.1:8000';
@Injectable({ providedIn: 'root' })
export class MailApi {
    private http = inject(HttpClient);
    /**
     * Llama al endpoint GET /mail/send_mail
     */
    sendMail(to: string, subject: string, body: string) {
        const params = new HttpParams()
        .set('to', to)
        .set('subject', subject)
        .set('body', body);

        return this.http.get<{ status: string; detail?: string }>(
        `${API_BASE}/mail/send_mail`,
        { params }
    );
  }
}
