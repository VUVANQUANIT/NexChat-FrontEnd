import { Component, ChangeDetectionStrategy, output, input } from '@angular/core';

@Component({
    selector: 'app-confirm-modal',
    standalone: true,
    templateUrl: './confirm-modal.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmModalComponent {
    title = input<string>('Xác nhận');
    message = input<string>('Bạn có chắc chắn không?');
    confirmText = input<string>('Xác nhận');
    cancelText = input<string>('Hủy');
    /** When true, the confirm button is styled red (danger action). */
    isDanger = input<boolean>(false);
    isLoading = input<boolean>(false);

    confirmed = output<void>();
    cancelled = output<void>();

    confirm(): void {
        this.confirmed.emit();
    }

    cancel(): void {
        this.cancelled.emit();
    }
}
