import { Component, OnDestroy } from '@angular/core';
import { FormGroup, FormControl } from '@angular/forms';
import { MatChipInputEvent, MatSnackBar } from '@angular/material';
import { Subscription, Observable, combineLatest, ReplaySubject } from 'rxjs';
import { tap, map, throttleTime, switchMap } from 'rxjs/operators';
import { storeGlobal, ISettings, retrieveGlobal, executeForAllGameTabs } from 'models';
import { DatabaseService } from 'src/app/shared/database.service';
import { ChatLogsService } from 'src/app/shared/chat-logs.service';
import { humanFileSize } from 'src/app/shared/utils/human-file-size';
import { MemberService } from 'src/app/shared/member.service';
import { ExportService, IExportProgressState } from 'src/app/shared/export.service';
import { ImportService, IImportProgressState } from 'src/app/shared/import.service';

@Component({
  selector: 'app-options',
  templateUrl: './options.component.html',
  styleUrls: ['./options.component.scss']
})
export class OptionsComponent implements OnDestroy {
  private formSubscription: Subscription;

  public settingsForm = new FormGroup({
    notifications: new FormGroup({
      beeps: new FormControl(false),
      friendOnline: new FormControl(false),
      friendOffline: new FormControl(false),
      actions: new FormControl(false),
      mentions: new FormControl(false),
      whispers: new FormControl(false),
      keywords: new FormControl([])
    }),
    tools: new FormGroup({
      chatRoomRefresh: new FormControl(true),
      fpsCounter: new FormControl(false)
    })
  });
  public databaseSize$: Observable<string>;
  public exportProgress?: IExportProgressState;
  public importProgress?: IImportProgressState;

  private refreshDatabaseSize$ = new ReplaySubject<void>(1);

  public get notificationControls(): FormGroup {
    return this.settingsForm.get('notifications') as FormGroup;
  }

  public get notifyKeywordsControl(): FormControl {
    return this.notificationControls.get('keywords') as FormControl;
  }

  constructor(
    private chatLogsService: ChatLogsService,
    private databaseService: DatabaseService,
    private exportService: ExportService,
    private importService: ImportService,
    private memberService: MemberService,
    private snackBar: MatSnackBar
  ) {
    retrieveGlobal('settings').then(settings => {
      this.settingsForm.patchValue(settings, {
        emitEvent: false
      });
    });

    this.formSubscription = this.settingsForm.valueChanges.pipe(
      map(value => ({
        notifications: {
          beeps: value.notifications.beeps,
          friendOnline: value.notifications.friendOnline,
          friendOffline: value.notifications.friendOffline,
          actions: value.notifications.actions,
          mentions: value.notifications.mentions,
          whispers: value.notifications.whispers,
          keywords: value.notifications.keywords
        },
        tools: {
          chatRoomRefresh: value.tools.chatRoomRefresh,
          fpsCounter: value.tools.fpsCounter
        }
      } as ISettings)),
      tap(settings => storeGlobal('settings', settings)),
      tap(() => this.showSavedNotice()),
      tap(settings => executeForAllGameTabs(tab => chrome.tabs.sendMessage(tab.id, settings)))
    ).subscribe();

    this.databaseSize$ = this.refreshDatabaseSize$.pipe(
      switchMap(_ =>
        combineLatest(this.chatLogsService.getTotalSize(), this.memberService.getTotalSize()).pipe(
          throttleTime(500),
          map(values => values.reduce((prev, cur) => prev + cur, 0)),
          map(value => humanFileSize(value))
        )
      )
    );
    this.refreshDatabaseSize$.next();
  }

  ngOnDestroy() {
    this.formSubscription.unsubscribe();
  }

  public addKeyword(event: MatChipInputEvent) {
    const input = event.input;
    const value = event.value;

    if ((value || '').trim()) {
      const keywords = this.notifyKeywordsControl.value as string[];
      keywords.push(value);
      this.notifyKeywordsControl.setValue(keywords);
    }

    if (input) {
      input.value = '';
    }
  }

  public removeKeyword(keyword: string) {
    const keywords = this.notifyKeywordsControl.value as string[];
    const index = keywords.indexOf(keyword);
    if (index >= 0) {
      keywords.splice(index, 1);
      this.notifyKeywordsControl.setValue(keywords);
    }
  }

  public downloadDatabase() {
    this.exportService.exportDatabase().subscribe(
      update => {
        if (update instanceof Blob) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(update);
          link.download = 'bondage-club-tools-export-' + new Date().toISOString() + '.zip';
          link.click();
        } else {
          this.exportProgress = update;
        }
      },
      error => {
        console.error(error);
        alert(error);
        this.exportProgress = undefined;
      },
      () => this.exportProgress = undefined
    );
  }

  public uploadDatabase() {
    const input = document.createElement('input') as HTMLInputElement;
    input.accept = 'application/json,.json,application/zip,.zip';
    input.type = 'file';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      this.importService.importDatabase(file).subscribe(
        update => {
          this.importProgress = update;
        },
        error => {
          console.error(error);
          alert(error);
          this.importProgress = undefined;
        },
        () => {
          this.importProgress = undefined;
          this.refreshDatabaseSize$.next();
        }
      );
    });
    input.click();
  }

  public async clearDatabase() {
    if (confirm('Are you sure you want to delete everything?')) {
      console.log('Clearing database...');
      const objectStoreNames = await this.databaseService.objectStoreNames;
      const transaction = await this.databaseService.transaction(objectStoreNames, 'readwrite');
      transaction.onerror = event => {
        console.error(event);
      };
      let count = 0;
      objectStoreNames.forEach(storeName => {
        console.log(`Clearing ${storeName}...`);
        transaction.objectStore(storeName).clear().onsuccess = () => {
          count++;
          console.log(`Done ${storeName}`);
          if (count === objectStoreNames.length) {
            console.log('Done with all');
            this.refreshDatabaseSize$.next();
          }
        };
      });
    }
  }

  private showSavedNotice() {
    this.snackBar.open('Preferences saved', undefined, {
      duration: 2000,
    });
  }
}
