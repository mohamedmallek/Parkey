import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from './auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [CommonModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly token = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  constructor() {
    this.token.set(this.route.snapshot.queryParamMap.get('token') ?? '');
    if (!this.token()) {
      this.error.set('Ce lien est incomplet. Demandez un nouveau mail depuis la connexion.');
    }
  }

  submit() {
    this.error.set('');
    const password = this.password();
    const confirm = this.confirm();
    if (!this.token()) {
      this.error.set('Ce lien n’est plus valable. Demandez un nouveau mail.');
      return;
    }
    if (password.length < 8) {
      this.error.set('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      this.error.set('Les deux mots de passe ne correspondent pas.');
      return;
    }
    this.loading.set(true);
    this.auth.resetPassword(this.token(), password, confirm).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.success.set(res.message || 'Mot de passe mis à jour. Vous pouvez vous connecter.');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'Impossible de changer le mot de passe. Réessayez.');
      },
    });
  }

  goLogin() {
    void this.router.navigateByUrl('/');
  }
}
