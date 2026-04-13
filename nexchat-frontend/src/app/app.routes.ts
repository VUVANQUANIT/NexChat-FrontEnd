import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'inbox',
        loadComponent: () => import('./components/inbox/inbox.component').then(m => m.InboxComponent),
        canActivate: [AuthGuard]
    },
    {
        path: 'chat/:id',
        loadComponent: () => import('./components/chat/chat.component').then(m => m.ChatComponent),
        canActivate: [AuthGuard]
    },
    {
        path: '',
        redirectTo: '/inbox',
        pathMatch: 'full'
    },
    {
        path: '**',
        redirectTo: '/inbox'
    }
];
