import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Legacy `/chat/:id` URLs redirect to `/inbox/:id` (single-screen layout).
 */
@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [CommonModule],
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            void this.router.navigate(['/inbox', id], { replaceUrl: true });
        } else {
            void this.router.navigate(['/inbox'], { replaceUrl: true });
        }
    }
}
