import { Routes } from '@angular/router';

import { App } from './app';
import { ResetPasswordComponent } from './reset-password.component';

export const routes: Routes = [
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: '', component: App },
  { path: '**', redirectTo: '' },
];
