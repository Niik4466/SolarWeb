import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

import { MinioListResponse, MinioObject } from '../shared/models/minio';
import { SkyFrame } from '../shared/models/sky-frame';;
import { minioObjectToSkyFrame, sortFramesByTime } from '../shared/utils/skyframe.util';

@Injectable({ providedIn: 'root' })
export class ImagesService {
  private http = inject(HttpClient);
  private readonly API_BASE = 'http://127.0.0.1:8000';
  private readonly BUCKET = 'imagenes-cielo';

  /**
   * Devuelve los frames de un día (YYYY-MM-DD) como SkyFrame[], ordenados por hora.
   */
  getDayFrames(dayISO: string): Observable<SkyFrame[]> {
    const prefix = dayISO.replaceAll('-', '/') + '/'; // "YYYY/MM/DD/"
    const params = new HttpParams()
      .set('bucket', this.BUCKET)
      .set('prefix', prefix);

    const url = `${this.API_BASE}/images`;

    return this.http.get<MinioListResponse>(url, { params }).pipe(
      map(resp => Array.isArray(resp?.objects) ? resp.objects : []),
      map((objects: MinioObject[]) =>
        objects
          .map(o => minioObjectToSkyFrame(o, this.BUCKET, this.API_BASE))
          .filter((f): f is SkyFrame => !!f)
      ),
      map(frames => sortFramesByTime(frames)),
      catchError((err) => {
        // dejamos el error “hacia arriba” como un array vacío; el componente hará el mensaje
        console.error('[ImagesService] getDayFrames error:', err);
        return of<SkyFrame[]>([]);
      }),
      shareReplay(1)
    );
  }
}
